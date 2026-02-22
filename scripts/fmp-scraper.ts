/**
 * FMP Unified Scraper
 *
 * Fetches all company data from Financial Modeling Prep API:
 * - Global stock list (actively trading stocks with $1B+ market cap)
 * - Batch quotes (price, market cap, PE ratio, daily change)
 * - Batch profiles (name, country)
 * - Quarterly income statements (TTM revenue, earnings, operating margin)
 * - Ratios TTM (dividend yield)
 * - Financial growth (5Y revenue/EPS growth)
 * - Analyst estimates (forward PE)
 *
 * Usage:
 *   npm run scrape                        # Full scrape (all data)
 *   npm run scrape -- --only forward_pe   # Only update forward P/E
 *   npm run scrape -- --only quotes       # Only update price/market cap/daily change
 *   npm run scrape -- --only week_52_high # Only update 52-week high
 *   npm run scrape -- --only financials   # Only update revenue/earnings/margins/ratios
 *   npm run scrape -- --only growth       # Only update growth metrics
 *   npm run scrape -- --only pe_ratio     # Only update P/E ratio and TTM EPS
 *   npm run scrape -- --only new_symbols    # Fetch data for supplemental symbols not yet in JSON
 *   npm run scrape -- --only currency_fix  # Fix non-USD revenue/earnings/forward_eps → USD
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { DatabaseCompany } from "../lib/types";

// Load from .env.local if present
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const FMP_API_KEY = process.env.FMP_API_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BASE_URL = "https://financialmodelingprep.com/stable";

// Fetch USD exchange rates from open.er-api.com
// Returns map of currency code → units per 1 USD (e.g. JPY → 155.14)
async function fetchFXRates(): Promise<Map<string, number>> {
  console.log("Fetching FX rates...");
  const response = await axios.get<{ rates: Record<string, number> }>(
    "https://open.er-api.com/v6/latest/USD",
    { timeout: 15000 }
  );
  const rates = new Map<string, number>();
  for (const [currency, rate] of Object.entries(response.data.rates)) {
    rates.set(currency, rate);
  }
  console.log(`  Got ${rates.size} FX rates\n`);
  return rates;
}

// Convert an amount from a foreign currency to USD
function toUSD(amount: number, currency: string, fxRates: Map<string, number>): number {
  if (currency === "USD") return amount;
  const rate = fxRates.get(currency);
  if (!rate) {
    console.log(`  Warning: no FX rate for ${currency}, treating as USD`);
    return amount;
  }
  return amount / rate;
}

// Process one request at a time (no concurrency)
const CONCURRENT_REQUESTS = 1;

// Base delay between API requests (ms) to avoid hammering the API
const REQUEST_DELAY_MS = 100;

// Extra delay applied after hitting a rate limit (ms), decays over time
let rateLimitCooldownUntil = 0;

// OTC/missing symbols that the FMP company-screener endpoint doesn't return,
// but all other FMP data endpoints (quote, profile, income, ratios, growth, estimates) work for.
// Format: symbol, // #rank Name ($marketCap, Country)
const SUPPLEMENTAL_SYMBOLS: string[] = [
  "TCEHY",    // Tencent ($613.6B, China)
  "XIACF",    // Xiaomi ($125.0B, China)
  "GMBXF",    // Grupo México ($93.4B, Mexico)
  "MMC",      // Marsh & McLennan ($89.8B, US)
  "GLCNF",    // Glencore ($80.3B, Switzerland)
  "KBCSF",    // KBC ($60.3B, Belgium)
  "WMMVF",    // Walmex ($58.8B, Mexico)
  "NPSNY",    // Naspers ($43.8B, South Africa)
  "MLYBY",    // Maybank ($43.2B, Malaysia)
  "FNLPF",    // Fresnillo ($38.3B, Mexico)
  "GBTC",     // Grayscale Bitcoin Trust ($36.6B, US)
  "FI",       // Fiserv ($34.3B, US)
  "EXPGF",    // Experian ($31.6B, Ireland)
  "CBOE",     // Cboe Global Markets ($30.2B, US)
  "K",        // Kellanova ($29.0B, US)
  "BABWF",    // Intl Consolidated Airlines ($28.2B, Spain)
  "ICTEF",    // Intl Container Terminal ($27.8B, Philippines)
  "DIDIY",    // DiDi ($22.5B, China)
  "TNABY",    // Tenaga Nasional ($22.3B, Malaysia)
  "WXXWY",    // WuXi Biologics ($21.9B, China)
  "CYBR",     // CyberArk Software ($20.6B, Israel)
  "SVTMF",    // SM Investments ($16.7B, Philippines)
  "AHCHF",    // Anhui Conch Cement ($14.8B, China)
  "BF-A",     // Brown Forman ($14.1B, US)
  "BDOUY",    // BDO Unibank ($13.0B, Philippines)
  "PSHZF",    // Pershing Square Holdings ($12.8B, US)
  "MNHVF",    // Mowi ($12.8B, Norway)
  "SPHXF",    // SM Prime Holdings ($11.5B, Philippines)
  "DAY",      // Dayforce ($11.2B, US)
  "LKNCY",    // Luckin Coffee ($10.8B, China)
  "BPYPP",    // Brookfield Property Partners ($10.8B, Bermuda)
  "AYALY",    // Ayala Corporation ($10.5B, Philippines)
  "BPHLY",    // Bank of the Philippine Islands ($9.9B, Philippines)
  "FNMA",     // Fannie Mae ($9.4B, US)
  "CHBAY",    // Chiba Bank ($9.1B, Japan)
  "IPG",      // Interpublic Group ($9.0B, US)
  "LLYVA",    // Liberty Live Group ($9.0B, US)
  "FPS",      // Forgent Power Solutions ($7.9B, US)
  "CADE",     // Cadence Bancorp ($7.8B, US)
  "INFA",     // Informatica ($7.6B, US)
  "LNW",      // Light & Wonder ($7.0B, US)
  "SNV",      // Synovus ($6.9B, US)
  "ZK",       // Zeekr ($6.8B, China)
  "MRUS",     // Merus ($6.8B, Netherlands)
  "CBC",      // Central Bancompany ($6.1B, US)
  "CCCS",     // CCC Intelligent Solutions ($5.6B, US)
  "AYAAF",    // Ayala Land ($5.5B, Philippines)
  "MTPOY",    // Metrobank ($5.1B, Philippines)
  "FMCC",     // Freddie Mac ($4.7B, US)
  "FINN",     // First National of Nebraska ($4.6B, US)
  "ABZPY",    // Aboitiz Power ($4.5B, Philippines)
  "AKRO",     // Akero Therapeutics ($4.5B, US)
  "LBTYB",    // Liberty Global ($4.4B, UK)
  "NINOY",    // Nikon ($4.1B, Japan)
  "JBFCF",    // Jollibee ($4.0B, Philippines)
  "ALE",      // Allete ($3.9B, US)
  "GTMEY",    // Globe Telecom ($3.9B, Philippines)
  "GRP-UN",   // Granite REIT ($3.6B, Canada)
  "TCGL",     // TechCreate Group ($3.5B, Singapore)
  "YSS",      // York Space Systems ($3.3B, US)
  "PCH",      // PotlatchDeltic ($3.2B, US)
  "JOYY",     // JOYY ($3.2B, China)
  "REVG",     // REV Group ($3.1B, US)
  "MPW",      // Medical Properties Trust ($3.0B, US)
  "HPP",      // Hudson Pacific Properties ($2.8B, US)
  "ATHM",     // Autohome ($2.5B, China)
  "NZTCF",    // Spark New Zealand ($2.5B, NZ)
  "UVRBF",    // Universal Robina ($2.4B, Philippines)
  "SPNS",     // Sapiens ($2.4B, Israel)
  "ITCLY",    // Itaú CorpBanca ($2.4B, Chile)
  "MLCO",     // Melco Resorts ($2.4B, Hong Kong)
  "CIVI",     // Civitas Resources ($2.3B, US)
  "KYN",      // Kayne Anderson ($2.3B, US)
  "HI",       // Hillenbrand ($2.3B, US)
  "CASH",     // Pathward Financial ($2.1B, US)
  "AVDL",     // Avadel Pharmaceuticals ($2.1B, Ireland)
  "AXL",      // American Axle ($2.1B, US)
  "AVDX",     // AvidXchange ($2.1B, US)
  "HOUS",     // Anywhere Real Estate ($2.0B, US)
  "SCS",      // Steelcase ($1.9B, US)
  "DVAX",     // Dynavax Technologies ($1.8B, US)
  "CURLF",    // Curaleaf ($1.8B, US)
  "SHCO",     // Soho House ($1.8B, US)
  "JAMF",     // Jamf ($1.7B, US)
  "IAS",      // Integral Ad Science ($1.7B, US)
  "RAPT",     // RAPT Therapeutics ($1.7B, US)
  "VBTX",     // Veritex Holdings ($1.7B, US)
  "TSAT",     // Telesat ($1.5B, Canada)
  "NXRT",     // NexPoint Residential Trust ($1.5B, US)
  "MLNK",     // MeridianLink ($1.5B, US)
  "TIGR",     // UP Fintech / Tiger Brokers ($1.4B, China)
  "ATAI",     // atai Life Sciences ($1.4B, Germany)
  "IVA",      // Inventiva ($1.4B, France)
  "LMRI",     // Lumexa Imaging ($1.4B, US)
  "JKS",      // Jinko Solar ($1.4B, China)
  "BASE",     // Couchbase ($1.4B, US)
  "LUXE",     // LuxExperience ($1.3B, Germany)
  "TE",       // T1 Energy ($1.3B, US)
  "CDNL",     // Cardinal Infrastructure ($1.3B, US)
  "VMEO",     // Vimeo ($1.3B, US)
  "SOC",      // Sable Offshore ($1.3B, US)
  "NEO",      // NeoGenomics ($1.3B, US)
  "GHLD",     // Guild Mortgage ($1.2B, US)
  "THS",      // TreeHouse Foods ($1.2B, US)
  "HSII",     // Heidrick & Struggles ($1.2B, US)
  "BTGO",     // BitGo ($1.2B, US)
  "BFS",      // Saul Centers ($1.2B, US)
  "TIXT",     // Telus International ($1.2B, Canada)
  "DBVT",     // DBV Technologies ($1.2B, France)
  "GLOP-PA",  // GasLog ($1.2B, Greece)
  "PX",       // P10 ($1.2B, US)
  "IOVA",     // Iovance Biotherapeutics ($1.1B, US)
  "MRVI",     // Maravai LifeSciences ($1.1B, US)
  "JMIA",     // Jumia ($1.1B, Germany)
  "ODV",      // Osisko Development ($1.1B, Canada)
  "CMPX",     // Compass Therapeutics ($1.1B, US)
  "METC",     // Ramaco Resources ($1.1B, US)
  "GILT",     // Gilat Satellite Networks ($1.1B, Israel)
  "EVEX",     // Eve Air Mobility ($1.1B, US)
  "CVAC",     // Curevac ($1.0B, Germany)
  "SLI",      // Standard Lithium ($1.0B, Canada)
  "AKTS",     // Aktis Oncology ($1.0B, US)
  "UAMY",     // US Antimony ($1.0B, US)
  "SUPV",     // Grupo Supervielle ($1.0B, Argentina)
  "GROY",     // Gold Royalty Corp ($1.0B, Canada)
  "NBBK",     // NB Bancorp ($1.0B, US)
  "JBGS",     // JBG SMITH ($1.0B, US)
  "CDNA",     // CareDx ($1.0B, US)
];

// FMP API response types
interface FMPScreenerResult {
  symbol: string;
  companyName: string;
  marketCap: number;
  price: number;
  volume: number;
  exchange: string;
  country: string;
}

interface FMPQuote {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  marketCap: number;
  yearHigh?: number;
}

interface FMPProfile {
  symbol: string;
  companyName: string;
  country: string;
  price: number;
}

interface FMPIncomeStatement {
  symbol: string;
  date: string;
  period: string;
  revenue: number;
  netIncome: number;
  operatingIncome: number;
  reportedCurrency: string;
}

interface FMPRatiosTTM {
  symbol: string;
  priceToEarningsRatioTTM: number | null;
  dividendYieldTTM: number | null;
}

interface FMPFinancialGrowth {
  symbol: string;
  fiveYRevenueGrowthPerShare: number | null;
  fiveYNetIncomeGrowthPerShare: number | null;
  threeYRevenueGrowthPerShare: number | null;
  threeYNetIncomeGrowthPerShare: number | null;
}

interface FMPAnalystEstimate {
  symbol: string;
  date: string;
  epsAvg: number;
}

// Accumulated company data
interface CompanyData {
  symbol: string;
  name: string;
  country: string;
  marketCap: number | null;
  price: number | null;
  week52High: number | null;
  dailyChangePercent: number | null;
  peRatio: number | null;
  ttmEPS: number | null;
  earnings: number | null;
  revenue: number | null;
  operatingMargin: number | null;
  dividendPercent: number | null;
  forwardPE: number | null;
  forwardEPS: number | null;
  forwardEPSDate: string | null;
  revenueGrowth5Y: number | null;
  revenueGrowth3Y: number | null;
  epsGrowth5Y: number | null;
  epsGrowth3Y: number | null;
}

// Convert total 5-year growth to CAGR
function totalGrowthToCAGR(totalGrowth: number): number {
  if (totalGrowth <= -1) {
    return -1;
  }
  return Math.pow(1 + totalGrowth, 1 / 5) - 1;
}

// Convert total 3-year growth to CAGR
function totalGrowthToCAGR3Y(totalGrowth: number): number {
  if (totalGrowth <= -1) {
    return -1;
  }
  return Math.pow(1 + totalGrowth, 1 / 3) - 1;
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch global stock symbols from company-screener endpoint ($1B+ market cap)
async function fetchGlobalStocks(): Promise<string[]> {
  console.log("Fetching global stock list from company-screener...");

  const allSymbols: string[] = [];
  let page = 0;
  const limit = 10000;

  while (true) {
    const url = `${BASE_URL}/company-screener?marketCapMoreThan=1000000000&isActivelyTrading=true&isEtf=false&isFund=false&limit=${limit}&page=${page}&apikey=${FMP_API_KEY}`;
    const response = await axios.get<any[]>(url, { timeout: 60000 });

    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      break;
    }

    const symbols = response.data.map((stock: any) => stock.symbol);
    allSymbols.push(...symbols);
    console.log(`  Page ${page}: fetched ${symbols.length} symbols (total: ${allSymbols.length})`);

    if (response.data.length < limit) {
      break; // Last page
    }
    page++;
  }

  if (allSymbols.length === 0) {
    throw new Error("Failed to fetch stock list from company-screener");
  }

  console.log(`Found ${allSymbols.length} global stocks from company-screener endpoint`);

  // Append supplemental OTC/missing symbols not returned by the screener
  const screenerSet = new Set(allSymbols);
  const added = SUPPLEMENTAL_SYMBOLS.filter(s => !screenerSet.has(s));
  allSymbols.push(...added);
  console.log(`Added ${added.length} supplemental symbols (total: ${allSymbols.length})`);

  return allSymbols;
}

// Fetch single quote
async function fetchQuote(symbol: string): Promise<FMPQuote | null> {
  const url = `${BASE_URL}/quote?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = await axios.get<FMPQuote[]>(url, { timeout: 10000 });

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    return response.data[0];
  }
  return null;
}

// Fetch quotes for all symbols (one at a time with concurrency)
async function fetchBatchQuotes(symbols: string[]): Promise<Map<string, FMPQuote>> {
  console.log(`Fetching quotes for ${symbols.length} symbols...`);
  return processSymbolsBatch(symbols, fetchQuote, "Quotes") as Promise<Map<string, FMPQuote>>;
}

// Fetch single profile
async function fetchProfile(symbol: string): Promise<FMPProfile | null> {
  const url = `${BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = await axios.get<FMPProfile[]>(url, { timeout: 10000 });

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    return response.data[0];
  }
  return null;
}

// Fetch profiles for all symbols (one at a time with concurrency)
async function fetchBatchProfiles(symbols: string[]): Promise<Map<string, FMPProfile>> {
  console.log(`Fetching profiles for ${symbols.length} symbols...`);
  return processSymbolsBatch(symbols, fetchProfile, "Profiles") as Promise<Map<string, FMPProfile>>;
}

// Fetch quarterly income statements for a symbol (returns last 4 quarters + reportedCurrency)
async function fetchQuarterlyIncome(symbol: string): Promise<{ statements: FMPIncomeStatement[]; reportedCurrency: string } | null> {
  const url = `${BASE_URL}/income-statement?symbol=${symbol}&period=quarter&limit=4&apikey=${FMP_API_KEY}`;
  const response = await axios.get<FMPIncomeStatement[]>(url, { timeout: 10000 });

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    const reportedCurrency = response.data[0].reportedCurrency || "USD";
    return { statements: response.data, reportedCurrency };
  }
  return null;
}

// Fetch ratios TTM for a symbol
async function fetchRatiosTTM(symbol: string): Promise<FMPRatiosTTM | null> {
  const url = `${BASE_URL}/ratios-ttm?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = await axios.get<FMPRatiosTTM[]>(url, { timeout: 10000 });

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    return response.data[0];
  }
  return null;
}

// Fetch financial growth for a symbol
async function fetchFinancialGrowth(symbol: string): Promise<FMPFinancialGrowth | null> {
  const url = `${BASE_URL}/financial-growth?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = await axios.get<FMPFinancialGrowth[]>(url, { timeout: 10000 });

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    return response.data[0];
  }
  return null;
}

// Fetch analyst estimates for a symbol
async function fetchAnalystEstimates(symbol: string): Promise<FMPAnalystEstimate | null> {
  const url = `${BASE_URL}/analyst-estimates?symbol=${symbol}&period=annual&apikey=${FMP_API_KEY}`;
  const response = await axios.get<FMPAnalystEstimate[]>(url, { timeout: 10000 });

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    const now = new Date();
    const threeMonthsFromNow = new Date(now);
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    // Sort by date ascending to get earliest first
    const sorted = [...response.data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Pick the first estimate whose fiscal year end is at least 3 months away
    // This gives us the "forward" estimate - if FY ends soon, use next FY
    const estimate = sorted.find((est) => {
      const fyEndDate = new Date(est.date);
      return fyEndDate >= threeMonthsFromNow;
    });

    return estimate || sorted[sorted.length - 1]; // Fall back to furthest out
  }
  return null;
}

// Check if an error is transient and worth retrying
function isTransientError(error: any): boolean {
  const status = error.response?.status;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  const code = error.code || '';
  return ['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN'].includes(code);
}

// Fetch single symbol with retry on transient errors
async function fetchWithRetry(
  symbol: string,
  fetchFn: (symbol: string) => Promise<any>,
  maxRetries: number = 5
): Promise<{ symbol: string; data: any }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Wait for any active rate limit cooldown
      const now = Date.now();
      if (rateLimitCooldownUntil > now) {
        await sleep(rateLimitCooldownUntil - now);
      }

      const data = await fetchFn(symbol);
      return { symbol, data };
    } catch (error: any) {
      const status = error.response?.status;

      if (isTransientError(error) && attempt < maxRetries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000);
        const reason = status === 429 ? 'rate limited' : (error.code || `HTTP ${status}`);
        console.log(`  ${reason} on ${symbol}, waiting ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);

        // On rate limit, also set a global cooldown so the next symbols wait too
        if (status === 429) {
          rateLimitCooldownUntil = Date.now() + backoffMs;
        }

        await sleep(backoffMs);
        continue;
      }

      // Non-retryable or exhausted retries — return null data instead of crashing
      const errorMsg = status ? `HTTP ${status}` : (error.code || error.message || 'unknown');
      console.log(`  Skipping ${symbol}: ${errorMsg}`);
      return { symbol, data: null };
    }
  }
  return { symbol, data: null };
}

// Process symbols with concurrent requests and automatic retries
async function processSymbolsBatch(
  symbols: string[],
  fetchFn: (symbol: string) => Promise<any>,
  description: string
): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  let processed = 0;
  let successCount = 0;

  // Process in batches of CONCURRENT_REQUESTS
  for (let i = 0; i < symbols.length; i += CONCURRENT_REQUESTS) {
    const batch = symbols.slice(i, i + CONCURRENT_REQUESTS);

    // Fetch all symbols in batch concurrently (each with its own retry logic)
    const batchResults = await Promise.all(
      batch.map(symbol => fetchWithRetry(symbol, fetchFn))
    );

    // Collect results
    for (const result of batchResults) {
      if (result.data) {
        results.set(result.symbol, result.data);
        successCount++;
      }
      processed++;
    }

    // Progress update every 100 symbols
    if (processed % 100 < CONCURRENT_REQUESTS || i + CONCURRENT_REQUESTS >= symbols.length) {
      const elapsed = Math.round((Date.now() - globalStartTime) / 1000 / 60);
      console.log(
        `  ${description}: ${processed}/${symbols.length} (${Math.round((processed / symbols.length) * 100)}%) - success: ${successCount} - ${elapsed}m elapsed`
      );
    }

    // Base delay between requests to avoid hammering the API
    if (i + CONCURRENT_REQUESTS < symbols.length) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  return results;
}

// Global start time for elapsed time tracking
let globalStartTime = Date.now();

// Main scraper function
async function runFMPScraper(): Promise<{
  companies: DatabaseCompany[];
  lastUpdated: string;
}> {
  console.log("\n========================================");
  console.log("  FMP Unified Scraper");
  console.log("========================================\n");

  globalStartTime = Date.now();
  const startTime = Date.now();

  // Step 1: Get global stock list
  const allSymbols = await fetchGlobalStocks();

  console.log(`Processing ${allSymbols.length} symbols with ${CONCURRENT_REQUESTS} concurrent requests\n`);

  // Step 2: Fetch batch quotes
  const quotes = await fetchBatchQuotes(allSymbols);
  console.log(`  Got quotes for ${quotes.size} symbols\n`);

  // Filter to symbols that have valid quotes and market cap
  const validSymbols = allSymbols.filter((s) => {
    const quote = quotes.get(s);
    return quote && quote.marketCap && quote.marketCap >= 1_000_000_000;
  });
  console.log(`Valid symbols after quote filter: ${validSymbols.length}\n`);

  // Step 3: Fetch batch profiles
  const profiles = await fetchBatchProfiles(validSymbols);
  console.log(`  Got profiles for ${profiles.size} symbols\n`);

  // Step 4: Fetch FX rates for currency conversion
  const fxRates = await fetchFXRates();

  // Step 5: Fetch individual data (income statements, ratios, growth, estimates)
  console.log("Fetching quarterly income statements...");
  const incomeStatements = await processSymbolsBatch(validSymbols, fetchQuarterlyIncome, "Income statements");
  console.log(`  Got income statements for ${incomeStatements.size} symbols\n`);

  console.log("Fetching ratios TTM...");
  const ratios = await processSymbolsBatch(validSymbols, fetchRatiosTTM, "Ratios TTM");
  console.log(`  Got ratios for ${ratios.size} symbols\n`);

  console.log("Fetching financial growth...");
  const growth = await processSymbolsBatch(validSymbols, fetchFinancialGrowth, "Financial growth");
  console.log(`  Got growth data for ${growth.size} symbols\n`);

  console.log("Fetching analyst estimates...");
  const estimates = await processSymbolsBatch(validSymbols, fetchAnalystEstimates, "Analyst estimates");
  console.log(`  Got estimates for ${estimates.size} symbols\n`);

  // Step 6: Build company data
  console.log("Building company data...");
  const companies: CompanyData[] = [];

  for (const symbol of validSymbols) {
    const quote = quotes.get(symbol);
    const profile = profiles.get(symbol);
    const incomeResult = incomeStatements.get(symbol) as { statements: FMPIncomeStatement[]; reportedCurrency: string } | undefined;
    const ratio = ratios.get(symbol) as FMPRatiosTTM | undefined;
    const growthData = growth.get(symbol) as FMPFinancialGrowth | undefined;
    const estimate = estimates.get(symbol) as FMPAnalystEstimate | undefined;

    if (!quote) continue;

    // Get reporting currency for this company
    const reportedCurrency = incomeResult?.reportedCurrency || "USD";

    // Calculate TTM values from quarterly income statements
    let ttmRevenue: number | null = null;
    let ttmEarnings: number | null = null;
    let ttmOperatingMargin: number | null = null;

    if (incomeResult && incomeResult.statements.length > 0) {
      const stmts = incomeResult.statements;
      const revenue = stmts.reduce((sum, q) => sum + (q.revenue || 0), 0);
      const netIncome = stmts.reduce((sum, q) => sum + (q.netIncome || 0), 0);
      const operatingIncome = stmts.reduce((sum, q) => sum + (q.operatingIncome || 0), 0);

      if (revenue > 0) {
        ttmRevenue = toUSD(revenue, reportedCurrency, fxRates);
        // Operating margin is a ratio — compute before conversion (same result)
        ttmOperatingMargin = operatingIncome / revenue;
      }
      if (netIncome !== 0) {
        ttmEarnings = toUSD(netIncome, reportedCurrency, fxRates);
      }
    }

    // Derive TTM EPS from FMP's P/E ratio for dynamic calculation later
    let ttmEPS: number | null = null;
    const peRatio = ratio?.priceToEarningsRatioTTM ?? null;
    if (peRatio && peRatio > 0 && quote.price) {
      ttmEPS = quote.price / peRatio;
    }

    // Store raw forward EPS data and calculate forward PE
    // Analyst estimates are in reporting currency — convert to USD before computing PE
    let forwardPE: number | null = null;
    let forwardEPS: number | null = null;
    let forwardEPSDate: string | null = null;

    if (estimate?.epsAvg && estimate.epsAvg > 0) {
      forwardEPS = toUSD(estimate.epsAvg, reportedCurrency, fxRates);
      forwardEPSDate = estimate.date;
      if (quote.price && forwardEPS > 0) {
        forwardPE = quote.price / forwardEPS;
      }
    }

    // Calculate growth metrics (convert total growth to CAGR)
    let revenueGrowth5Y: number | null = null;
    let revenueGrowth3Y: number | null = null;
    let epsGrowth5Y: number | null = null;
    let epsGrowth3Y: number | null = null;

    if (growthData) {
      if (growthData.fiveYRevenueGrowthPerShare !== null && growthData.fiveYRevenueGrowthPerShare !== undefined) {
        revenueGrowth5Y = totalGrowthToCAGR(growthData.fiveYRevenueGrowthPerShare);
      }
      if (growthData.threeYRevenueGrowthPerShare !== null && growthData.threeYRevenueGrowthPerShare !== undefined) {
        revenueGrowth3Y = totalGrowthToCAGR3Y(growthData.threeYRevenueGrowthPerShare);
      }
      if (growthData.fiveYNetIncomeGrowthPerShare !== null && growthData.fiveYNetIncomeGrowthPerShare !== undefined) {
        epsGrowth5Y = totalGrowthToCAGR(growthData.fiveYNetIncomeGrowthPerShare);
      }
      if (growthData.threeYNetIncomeGrowthPerShare !== null && growthData.threeYNetIncomeGrowthPerShare !== undefined) {
        epsGrowth3Y = totalGrowthToCAGR3Y(growthData.threeYNetIncomeGrowthPerShare);
      }
    }

    companies.push({
      symbol,
      name: profile?.companyName || quote.name || symbol,
      country: profile?.country || "US",
      marketCap: quote.marketCap,
      price: quote.price,
      week52High: quote.yearHigh ?? null,
      dailyChangePercent: quote.changePercentage,
      peRatio,
      ttmEPS,
      earnings: ttmEarnings,
      revenue: ttmRevenue,
      operatingMargin: ttmOperatingMargin,
      dividendPercent: ratio?.dividendYieldTTM ?? null,
      forwardPE,
      forwardEPS,
      forwardEPSDate,
      revenueGrowth5Y,
      revenueGrowth3Y,
      epsGrowth5Y,
      epsGrowth3Y,
    });
  }

  // Step 7: Sort by market cap and assign ranks
  companies.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
  companies.forEach((c, i) => {
    (c as any).rank = i + 1;
  });

  // Step 8: Convert to DatabaseCompany format
  const timestamp = new Date().toISOString();
  const dbCompanies: DatabaseCompany[] = companies.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    rank: (c as any).rank,
    market_cap: c.marketCap,
    price: c.price,
    week_52_high: c.week52High,
    daily_change_percent: c.dailyChangePercent,
    earnings: c.earnings,
    revenue: c.revenue,
    pe_ratio: c.peRatio,
    ttm_eps: c.ttmEPS,
    forward_pe: c.forwardPE,
    forward_eps: c.forwardEPS,
    forward_eps_date: c.forwardEPSDate,
    dividend_percent: c.dividendPercent,
    operating_margin: c.operatingMargin,
    revenue_growth_5y: c.revenueGrowth5Y,
    revenue_growth_3y: c.revenueGrowth3Y,
    eps_growth_5y: c.epsGrowth5Y,
    eps_growth_3y: c.epsGrowth3Y,
    country: c.country,
    last_updated: timestamp,
  }));

  // Summary stats
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const stats = {
    total: dbCompanies.length,
    withEarnings: dbCompanies.filter((c) => c.earnings !== null).length,
    withRevenue: dbCompanies.filter((c) => c.revenue !== null).length,
    withPERatio: dbCompanies.filter((c) => c.pe_ratio !== null).length,
    withDividend: dbCompanies.filter((c) => c.dividend_percent !== null).length,
    withMargin: dbCompanies.filter((c) => c.operating_margin !== null).length,
    withForwardPE: dbCompanies.filter((c) => c.forward_pe !== null).length,
    withRevenueGrowth5Y: dbCompanies.filter((c) => c.revenue_growth_5y !== null).length,
    withRevenueGrowth3Y: dbCompanies.filter((c) => c.revenue_growth_3y !== null).length,
    withEPSGrowth5Y: dbCompanies.filter((c) => c.eps_growth_5y !== null).length,
    withEPSGrowth3Y: dbCompanies.filter((c) => c.eps_growth_3y !== null).length,
  };

  console.log("\n========================================");
  console.log("  Summary");
  console.log("========================================\n");
  console.log(`Total companies:        ${stats.total}`);
  console.log(`With earnings:          ${stats.withEarnings} (${Math.round((stats.withEarnings / stats.total) * 100)}%)`);
  console.log(`With revenue:           ${stats.withRevenue} (${Math.round((stats.withRevenue / stats.total) * 100)}%)`);
  console.log(`With P/E ratio:         ${stats.withPERatio} (${Math.round((stats.withPERatio / stats.total) * 100)}%)`);
  console.log(`With dividend:          ${stats.withDividend} (${Math.round((stats.withDividend / stats.total) * 100)}%)`);
  console.log(`With operating margin:  ${stats.withMargin} (${Math.round((stats.withMargin / stats.total) * 100)}%)`);
  console.log(`With forward PE:        ${stats.withForwardPE} (${Math.round((stats.withForwardPE / stats.total) * 100)}%)`);
  console.log(`With revenue growth 5Y: ${stats.withRevenueGrowth5Y} (${Math.round((stats.withRevenueGrowth5Y / stats.total) * 100)}%)`);
  console.log(`With revenue growth 3Y: ${stats.withRevenueGrowth3Y} (${Math.round((stats.withRevenueGrowth3Y / stats.total) * 100)}%)`);
  console.log(`With EPS growth 5Y:     ${stats.withEPSGrowth5Y} (${Math.round((stats.withEPSGrowth5Y / stats.total) * 100)}%)`);
  console.log(`With EPS growth 3Y:     ${stats.withEPSGrowth3Y} (${Math.round((stats.withEPSGrowth3Y / stats.total) * 100)}%)`);
  console.log(`\nDuration: ${duration} minutes`);

  return {
    companies: dbCompanies,
    lastUpdated: timestamp,
  };
}

// Export for use in API route
export { runFMPScraper };

// Partial update types
type PartialUpdateType = "forward_pe" | "quotes" | "financials" | "growth" | "pe_ratio" | "week_52_high" | "new_symbols" | "currency_fix";

// Run a partial update (only fetch and update specific fields)
async function runPartialUpdate(updateType: PartialUpdateType): Promise<{
  companies: DatabaseCompany[];
  lastUpdated: string;
}> {
  console.log("\n========================================");
  console.log(`  FMP Partial Update: ${updateType}`);
  console.log("========================================\n");

  globalStartTime = Date.now();
  const startTime = Date.now();

  // Load existing data
  const jsonPath = path.join(process.cwd(), "data", "companies.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error("No existing companies.json found. Run a full scrape first.");
  }

  const existingData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const existingCompanies: DatabaseCompany[] = existingData.companies;
  const symbols = existingCompanies.map((c) => c.symbol);

  console.log(`Loaded ${symbols.length} symbols from existing data\n`);

  // Create a map for quick lookup
  const companyMap = new Map<string, DatabaseCompany>();
  for (const company of existingCompanies) {
    companyMap.set(company.symbol, { ...company });
  }

  // Fetch only the required data based on update type
  if (updateType === "forward_pe") {
    const fxRates = await fetchFXRates();

    console.log("Fetching quarterly income statements (for currency detection)...");
    const incomeStatements = await processSymbolsBatch(symbols, fetchQuarterlyIncome, "Income statements");
    console.log(`  Got income statements for ${incomeStatements.size} symbols\n`);

    console.log("Fetching analyst estimates...");
    const estimates = await processSymbolsBatch(symbols, fetchAnalystEstimates, "Analyst estimates");
    console.log(`  Got estimates for ${estimates.size} symbols\n`);

    // Update forward_pe and store USD-converted EPS for each company
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const estimate = estimates.get(symbol) as FMPAnalystEstimate | undefined;
      if (estimate?.epsAvg && estimate.epsAvg > 0) {
        const incomeResult = incomeStatements.get(symbol) as { statements: FMPIncomeStatement[]; reportedCurrency: string } | undefined;
        const reportedCurrency = incomeResult?.reportedCurrency || "USD";
        const epsUSD = toUSD(estimate.epsAvg, reportedCurrency, fxRates);
        company.forward_eps = epsUSD;
        company.forward_eps_date = estimate.date;
        if (company.price && epsUSD > 0) {
          company.forward_pe = company.price / epsUSD;
        }
        updated++;
      }
    }
    console.log(`Updated forward_pe for ${updated} companies`);

  } else if (updateType === "quotes") {
    console.log("Fetching quotes...");
    const quotes = await fetchBatchQuotes(symbols);
    console.log(`  Got quotes for ${quotes.size} symbols\n`);

    // Update quote-related fields
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const quote = quotes.get(symbol);
      if (quote) {
        company.price = quote.price;
        company.market_cap = quote.marketCap;
        company.week_52_high = quote.yearHigh ?? company.week_52_high ?? null;
        company.daily_change_percent = quote.changePercentage;
        updated++;
      }
    }
    console.log(`Updated quotes for ${updated} companies`);

    // Re-sort by market cap and update ranks
    const sortedCompanies = Array.from(companyMap.values())
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));
    sortedCompanies.forEach((c, i) => {
      c.rank = i + 1;
    });

  } else if (updateType === "week_52_high") {
    console.log("Fetching quotes...");
    const quotes = await fetchBatchQuotes(symbols);
    console.log(`  Got quotes for ${quotes.size} symbols\n`);

    // Update only week_52_high from quote.yearHigh
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const quote = quotes.get(symbol);
      if (quote) {
        company.week_52_high = quote.yearHigh ?? company.week_52_high ?? null;
        updated++;
      }
    }
    console.log(`Updated week_52_high for ${updated} companies`);

  } else if (updateType === "financials") {
    const fxRates = await fetchFXRates();

    console.log("Fetching quarterly income statements...");
    const incomeStatements = await processSymbolsBatch(symbols, fetchQuarterlyIncome, "Income statements");
    console.log(`  Got income statements for ${incomeStatements.size} symbols\n`);

    console.log("Fetching ratios TTM...");
    const ratios = await processSymbolsBatch(symbols, fetchRatiosTTM, "Ratios TTM");
    console.log(`  Got ratios for ${ratios.size} symbols\n`);

    // Update financial fields
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const incomeResult = incomeStatements.get(symbol) as { statements: FMPIncomeStatement[]; reportedCurrency: string } | undefined;
      const ratio = ratios.get(symbol) as FMPRatiosTTM | undefined;

      if (incomeResult && incomeResult.statements.length > 0) {
        const reportedCurrency = incomeResult.reportedCurrency;
        const stmts = incomeResult.statements;
        const revenue = stmts.reduce((sum, q) => sum + (q.revenue || 0), 0);
        const netIncome = stmts.reduce((sum, q) => sum + (q.netIncome || 0), 0);
        const operatingIncome = stmts.reduce((sum, q) => sum + (q.operatingIncome || 0), 0);

        if (revenue > 0) {
          company.revenue = toUSD(revenue, reportedCurrency, fxRates);
          company.operating_margin = operatingIncome / revenue;
        }
        if (netIncome !== 0) {
          company.earnings = toUSD(netIncome, reportedCurrency, fxRates);
        }
        updated++;
      }

      if (ratio) {
        company.pe_ratio = ratio.priceToEarningsRatioTTM ?? company.pe_ratio;
        company.dividend_percent = ratio.dividendYieldTTM ?? company.dividend_percent;
        // Derive TTM EPS from P/E ratio for dynamic calculation later
        if (ratio.priceToEarningsRatioTTM && ratio.priceToEarningsRatioTTM > 0 && company.price) {
          company.ttm_eps = company.price / ratio.priceToEarningsRatioTTM;
        }
      }
    }
    console.log(`Updated financials for ${updated} companies`);

  } else if (updateType === "growth") {
    console.log("Fetching financial growth...");
    const growth = await processSymbolsBatch(symbols, fetchFinancialGrowth, "Financial growth");
    console.log(`  Got growth data for ${growth.size} symbols\n`);

    // Update growth fields
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const growthData = growth.get(symbol) as FMPFinancialGrowth | undefined;

      if (growthData) {
        if (growthData.fiveYRevenueGrowthPerShare !== null && growthData.fiveYRevenueGrowthPerShare !== undefined) {
          company.revenue_growth_5y = totalGrowthToCAGR(growthData.fiveYRevenueGrowthPerShare);
        }
        if (growthData.threeYRevenueGrowthPerShare !== null && growthData.threeYRevenueGrowthPerShare !== undefined) {
          company.revenue_growth_3y = totalGrowthToCAGR3Y(growthData.threeYRevenueGrowthPerShare);
        }
        if (growthData.fiveYNetIncomeGrowthPerShare !== null && growthData.fiveYNetIncomeGrowthPerShare !== undefined) {
          company.eps_growth_5y = totalGrowthToCAGR(growthData.fiveYNetIncomeGrowthPerShare);
        }
        if (growthData.threeYNetIncomeGrowthPerShare !== null && growthData.threeYNetIncomeGrowthPerShare !== undefined) {
          company.eps_growth_3y = totalGrowthToCAGR3Y(growthData.threeYNetIncomeGrowthPerShare);
        }
        updated++;
      }
    }
    console.log(`Updated growth data for ${updated} companies`);

  } else if (updateType === "pe_ratio") {
    console.log("Fetching ratios TTM...");
    const ratios = await processSymbolsBatch(symbols, fetchRatiosTTM, "Ratios TTM");
    console.log(`  Got ratios for ${ratios.size} symbols\n`);

    // Update only pe_ratio and ttm_eps
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const ratio = ratios.get(symbol) as FMPRatiosTTM | undefined;
      if (ratio?.priceToEarningsRatioTTM && ratio.priceToEarningsRatioTTM > 0) {
        company.pe_ratio = ratio.priceToEarningsRatioTTM;
        if (company.price) {
          company.ttm_eps = company.price / ratio.priceToEarningsRatioTTM;
        }
        updated++;
      }
    }
    console.log(`Updated pe_ratio for ${updated} companies`);

  } else if (updateType === "currency_fix") {
    // Fix currency mismatch: convert revenue/earnings/forward_eps from reporting currency to USD
    // Only updates companies where reportedCurrency != 'USD'
    const fxRates = await fetchFXRates();

    console.log("Fetching quarterly income statements (for currency detection)...");
    const incomeStatements = await processSymbolsBatch(symbols, fetchQuarterlyIncome, "Income statements");
    console.log(`  Got income statements for ${incomeStatements.size} symbols\n`);

    console.log("Fetching analyst estimates...");
    const estimates = await processSymbolsBatch(symbols, fetchAnalystEstimates, "Analyst estimates");
    console.log(`  Got estimates for ${estimates.size} symbols\n`);

    let updated = 0;
    let skippedUSD = 0;
    for (const [symbol, company] of companyMap) {
      const incomeResult = incomeStatements.get(symbol) as { statements: FMPIncomeStatement[]; reportedCurrency: string } | undefined;
      if (!incomeResult) continue;

      const reportedCurrency = incomeResult.reportedCurrency;
      if (reportedCurrency === "USD") {
        skippedUSD++;
        continue;
      }

      const stmts = incomeResult.statements;

      // Recompute and convert revenue/earnings from income statements
      if (stmts.length > 0) {
        const revenue = stmts.reduce((sum, q) => sum + (q.revenue || 0), 0);
        const netIncome = stmts.reduce((sum, q) => sum + (q.netIncome || 0), 0);
        const operatingIncome = stmts.reduce((sum, q) => sum + (q.operatingIncome || 0), 0);

        if (revenue > 0) {
          company.revenue = toUSD(revenue, reportedCurrency, fxRates);
          company.operating_margin = operatingIncome / revenue;
        }
        if (netIncome !== 0) {
          company.earnings = toUSD(netIncome, reportedCurrency, fxRates);
        }
      }

      // Convert forward EPS and recalculate forward PE
      const estimate = estimates.get(symbol) as FMPAnalystEstimate | undefined;
      if (estimate?.epsAvg && estimate.epsAvg > 0) {
        const epsUSD = toUSD(estimate.epsAvg, reportedCurrency, fxRates);
        company.forward_eps = epsUSD;
        company.forward_eps_date = estimate.date;
        if (company.price && epsUSD > 0) {
          company.forward_pe = company.price / epsUSD;
        }
      }

      updated++;
    }
    console.log(`Fixed currency for ${updated} non-USD companies (skipped ${skippedUSD} USD companies)`);

  } else if (updateType === "new_symbols") {
    // Find supplemental symbols not already in the dataset
    const existingSymbolSet = new Set(symbols);
    const newSymbols = SUPPLEMENTAL_SYMBOLS.filter(s => !existingSymbolSet.has(s));

    if (newSymbols.length === 0) {
      console.log("All supplemental symbols already present in dataset. Nothing to do.");
      return { companies: existingCompanies, lastUpdated: existingData.lastUpdated };
    }

    console.log(`Found ${newSymbols.length} new symbols to fetch: ${newSymbols.slice(0, 10).join(", ")}${newSymbols.length > 10 ? "..." : ""}\n`);

    const fxRates = await fetchFXRates();

    // Fetch all data for new symbols
    console.log("Fetching quotes...");
    const quotes = await fetchBatchQuotes(newSymbols);
    console.log(`  Got quotes for ${quotes.size} symbols\n`);

    // Filter to symbols with valid quotes and market cap >= $100M
    const validNewSymbols = newSymbols.filter(s => {
      const quote = quotes.get(s);
      return quote && quote.marketCap && quote.marketCap >= 100_000_000;
    });
    console.log(`Valid new symbols after quote filter: ${validNewSymbols.length}\n`);

    console.log("Fetching profiles...");
    const profiles = await fetchBatchProfiles(validNewSymbols);
    console.log(`  Got profiles for ${profiles.size} symbols\n`);

    console.log("Fetching quarterly income statements...");
    const incomeStatements = await processSymbolsBatch(validNewSymbols, fetchQuarterlyIncome, "Income statements");
    console.log(`  Got income statements for ${incomeStatements.size} symbols\n`);

    console.log("Fetching ratios TTM...");
    const ratios = await processSymbolsBatch(validNewSymbols, fetchRatiosTTM, "Ratios TTM");
    console.log(`  Got ratios for ${ratios.size} symbols\n`);

    console.log("Fetching financial growth...");
    const growthData = await processSymbolsBatch(validNewSymbols, fetchFinancialGrowth, "Financial growth");
    console.log(`  Got growth data for ${growthData.size} symbols\n`);

    console.log("Fetching analyst estimates...");
    const estData = await processSymbolsBatch(validNewSymbols, fetchAnalystEstimates, "Analyst estimates");
    console.log(`  Got estimates for ${estData.size} symbols\n`);

    // Build CompanyData objects for new symbols
    console.log("Building company data for new symbols...");
    const timestamp = new Date().toISOString();
    let addedCount = 0;

    for (const symbol of validNewSymbols) {
      const quote = quotes.get(symbol);
      const profile = profiles.get(symbol);
      const incomeResult = incomeStatements.get(symbol) as { statements: FMPIncomeStatement[]; reportedCurrency: string } | undefined;
      const ratio = ratios.get(symbol) as FMPRatiosTTM | undefined;
      const gd = growthData.get(symbol) as FMPFinancialGrowth | undefined;
      const estimate = estData.get(symbol) as FMPAnalystEstimate | undefined;

      if (!quote) continue;

      const reportedCurrency = incomeResult?.reportedCurrency || "USD";

      // Calculate TTM values from quarterly income statements
      let ttmRevenue: number | null = null;
      let ttmEarnings: number | null = null;
      let ttmOperatingMargin: number | null = null;

      if (incomeResult && incomeResult.statements.length > 0) {
        const stmts = incomeResult.statements;
        const revenue = stmts.reduce((sum, q) => sum + (q.revenue || 0), 0);
        const netIncome = stmts.reduce((sum, q) => sum + (q.netIncome || 0), 0);
        const operatingIncome = stmts.reduce((sum, q) => sum + (q.operatingIncome || 0), 0);

        if (revenue > 0) {
          ttmRevenue = toUSD(revenue, reportedCurrency, fxRates);
          ttmOperatingMargin = operatingIncome / revenue;
        }
        if (netIncome !== 0) {
          ttmEarnings = toUSD(netIncome, reportedCurrency, fxRates);
        }
      }

      // Derive TTM EPS from FMP's P/E ratio
      let ttmEPS: number | null = null;
      const peRatio = ratio?.priceToEarningsRatioTTM ?? null;
      if (peRatio && peRatio > 0 && quote.price) {
        ttmEPS = quote.price / peRatio;
      }

      // Forward PE from analyst estimates (convert EPS to USD)
      let forwardPE: number | null = null;
      let forwardEPS: number | null = null;
      let forwardEPSDate: string | null = null;

      if (estimate?.epsAvg && estimate.epsAvg > 0) {
        forwardEPS = toUSD(estimate.epsAvg, reportedCurrency, fxRates);
        forwardEPSDate = estimate.date;
        if (quote.price && forwardEPS > 0) {
          forwardPE = quote.price / forwardEPS;
        }
      }

      // Growth metrics (convert total growth to CAGR)
      let revenueGrowth5Y: number | null = null;
      let revenueGrowth3Y: number | null = null;
      let epsGrowth5Y: number | null = null;
      let epsGrowth3Y: number | null = null;

      if (gd) {
        if (gd.fiveYRevenueGrowthPerShare !== null && gd.fiveYRevenueGrowthPerShare !== undefined) {
          revenueGrowth5Y = totalGrowthToCAGR(gd.fiveYRevenueGrowthPerShare);
        }
        if (gd.threeYRevenueGrowthPerShare !== null && gd.threeYRevenueGrowthPerShare !== undefined) {
          revenueGrowth3Y = totalGrowthToCAGR3Y(gd.threeYRevenueGrowthPerShare);
        }
        if (gd.fiveYNetIncomeGrowthPerShare !== null && gd.fiveYNetIncomeGrowthPerShare !== undefined) {
          epsGrowth5Y = totalGrowthToCAGR(gd.fiveYNetIncomeGrowthPerShare);
        }
        if (gd.threeYNetIncomeGrowthPerShare !== null && gd.threeYNetIncomeGrowthPerShare !== undefined) {
          epsGrowth3Y = totalGrowthToCAGR3Y(gd.threeYNetIncomeGrowthPerShare);
        }
      }

      const dbCompany: DatabaseCompany = {
        symbol,
        name: profile?.companyName || quote.name || symbol,
        rank: null,
        market_cap: quote.marketCap,
        price: quote.price,
        week_52_high: quote.yearHigh ?? null,
        daily_change_percent: quote.changePercentage,
        earnings: ttmEarnings,
        revenue: ttmRevenue,
        pe_ratio: peRatio,
        ttm_eps: ttmEPS,
        forward_pe: forwardPE,
        forward_eps: forwardEPS,
        forward_eps_date: forwardEPSDate,
        dividend_percent: ratio?.dividendYieldTTM ?? null,
        operating_margin: ttmOperatingMargin,
        revenue_growth_5y: revenueGrowth5Y,
        revenue_growth_3y: revenueGrowth3Y,
        eps_growth_5y: epsGrowth5Y,
        eps_growth_3y: epsGrowth3Y,
        country: profile?.country || "US",
        last_updated: timestamp,
      };

      companyMap.set(symbol, dbCompany);
      addedCount++;
    }

    console.log(`Added ${addedCount} new companies`);

    // Re-sort by market cap and reassign all ranks
    const allCompanies = Array.from(companyMap.values())
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));
    allCompanies.forEach((c, i) => {
      c.rank = i + 1;
    });

    // Replace companyMap contents with sorted data
    companyMap.clear();
    for (const c of allCompanies) {
      companyMap.set(c.symbol, c);
    }
  }

  // Update timestamp for all companies
  const timestamp = new Date().toISOString();
  for (const company of companyMap.values()) {
    company.last_updated = timestamp;
  }

  const dbCompanies = Array.from(companyMap.values());

  // Summary
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\nDuration: ${duration} minutes`);

  return {
    companies: dbCompanies,
    lastUpdated: timestamp,
  };
}

// Parse CLI arguments
function parseArgs(): { only?: PartialUpdateType } {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf("--only");

  if (onlyIndex !== -1 && args[onlyIndex + 1]) {
    const updateType = args[onlyIndex + 1] as PartialUpdateType;
    const validTypes: PartialUpdateType[] = ["forward_pe", "quotes", "financials", "growth", "pe_ratio", "week_52_high", "new_symbols", "currency_fix"];
    if (!validTypes.includes(updateType)) {
      console.error(`Error: Invalid update type '${updateType}'`);
      console.error(`Valid types: ${validTypes.join(", ")}`);
      process.exit(1);
    }
    return { only: updateType };
  }

  return {};
}

// Main function for CLI
async function main() {
  if (!FMP_API_KEY) {
    console.error("Error: FMP_API_KEY not found in environment");
    console.error("Please set it in .env.local or environment variables");
    process.exit(1);
  }

  const args = parseArgs();

  // Run either partial update or full scrape
  const { companies, lastUpdated } = args.only
    ? await runPartialUpdate(args.only)
    : await runFMPScraper();

  // Write to local JSON file
  const jsonPath = path.join(process.cwd(), "data", "companies.json");
  const jsonData = {
    companies,
    lastUpdated,
    exportedAt: lastUpdated,
  };

  // Ensure data directory exists
  const dataDir = path.dirname(jsonPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log(`\nWrote ${companies.length} companies to data/companies.json`);

  // Upload to Vercel Blob if token is available
  if (BLOB_TOKEN) {
    console.log("\nUploading to Vercel Blob...");
    try {
      const blob = await put("companies.json", JSON.stringify(jsonData), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        token: BLOB_TOKEN,
      });
      console.log(`Uploaded to: ${blob.url}`);
    } catch (error: any) {
      console.error("Failed to upload to Vercel Blob:", error.message);
    }
  }

  console.log("\nFMP scraper complete!");
}

// Run if called directly (not imported)
const isMainModule = typeof require !== 'undefined' && require.main === module;
const isDirectRun = process.argv[1]?.includes('fmp-scraper');

if (isMainModule || isDirectRun) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
