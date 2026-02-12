/**
 * FMP Unified Scraper
 *
 * Fetches all company data from Financial Modeling Prep API:
 * - Stock list (US actively trading stocks)
 * - Batch quotes (price, market cap, PE ratio, daily change)
 * - Batch profiles (name, country)
 * - Quarterly income statements (TTM revenue, earnings, operating margin)
 * - Ratios TTM (dividend yield)
 * - Financial growth (5Y revenue/EPS growth)
 * - Analyst estimates (forward PE)
 *
 * Usage:
 *   npm run scrape                      # Full scrape (all data)
 *   npm run scrape -- --only forward_pe # Only update forward P/E
 *   npm run scrape -- --only quotes     # Only update price/market cap/daily change
 *   npm run scrape -- --only week_52_high # Only update 52-week high
 *   npm run scrape -- --only financials # Only update revenue/earnings/margins/ratios
 *   npm run scrape -- --only growth     # Only update growth metrics
 *   npm run scrape -- --only pe_ratio   # Only update P/E ratio and TTM EPS
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

// Process one request at a time (no concurrency)
const CONCURRENT_REQUESTS = 1;

// Base delay between API requests (ms) to avoid hammering the API
const REQUEST_DELAY_MS = 100;

// Extra delay applied after hitting a rate limit (ms), decays over time
let rateLimitCooldownUntil = 0;

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

// Fetch US stock symbols from existing companies.json or use stock/list endpoint
async function fetchUSStocks(): Promise<string[]> {
  console.log("Fetching US stock list...");

  // Load existing symbols from companies.json
  const jsonPath = path.join(process.cwd(), "data", "companies.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      if (data.companies && Array.isArray(data.companies)) {
        const symbols = data.companies.map((c: any) => c.symbol);
        console.log(`Loaded ${symbols.length} symbols from existing companies.json`);
        return symbols;
      }
    } catch (error) {
      console.log("Could not load existing companies.json, fetching from API...");
    }
  }

  // Fallback: fetch from stock/list endpoint and filter for major US exchanges
  const url = `${BASE_URL}/stock/list?apikey=${FMP_API_KEY}`;
  const response = await axios.get<any[]>(url, { timeout: 60000 });

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error("Failed to fetch stock list");
  }

  // Filter to US exchanges (NASDAQ, NYSE, AMEX) and exclude non-standard symbols
  const usExchanges = ["NASDAQ", "NYSE", "AMEX", "New York Stock Exchange", "Nasdaq Global Select"];
  const symbols = response.data
    .filter((stock) => {
      const exchange = stock.exchangeShortName || stock.exchange || "";
      return usExchanges.some(e => exchange.toUpperCase().includes(e.toUpperCase()));
    })
    .map((stock) => stock.symbol)
    .filter((s: string) => !s.includes(".") && !s.includes("-") && s.length <= 5); // Standard ticker format

  console.log(`Found ${symbols.length} US stocks from stock/list endpoint`);
  return symbols;
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

// Fetch quarterly income statements for a symbol (returns last 4 quarters)
async function fetchQuarterlyIncome(symbol: string): Promise<FMPIncomeStatement[] | null> {
  const url = `${BASE_URL}/income-statement?symbol=${symbol}&period=quarter&limit=4&apikey=${FMP_API_KEY}`;
  const response = await axios.get<FMPIncomeStatement[]>(url, { timeout: 10000 });

  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    return response.data;
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

  // Step 1: Get US stock list
  const allSymbols = await fetchUSStocks();

  console.log(`Processing ${allSymbols.length} symbols with ${CONCURRENT_REQUESTS} concurrent requests\n`);

  // Step 2: Fetch batch quotes
  const quotes = await fetchBatchQuotes(allSymbols);
  console.log(`  Got quotes for ${quotes.size} symbols\n`);

  // Filter to symbols that have valid quotes and market cap
  const validSymbols = allSymbols.filter((s) => {
    const quote = quotes.get(s);
    return quote && quote.marketCap && quote.marketCap > 0;
  });
  console.log(`Valid symbols after quote filter: ${validSymbols.length}\n`);

  // Step 3: Fetch batch profiles
  const profiles = await fetchBatchProfiles(validSymbols);
  console.log(`  Got profiles for ${profiles.size} symbols\n`);

  // Step 4: Fetch individual data (income statements, ratios, growth, estimates)
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

  // Step 5: Build company data
  console.log("Building company data...");
  const companies: CompanyData[] = [];

  for (const symbol of validSymbols) {
    const quote = quotes.get(symbol);
    const profile = profiles.get(symbol);
    const quarterlyIncome = incomeStatements.get(symbol) as FMPIncomeStatement[] | undefined;
    const ratio = ratios.get(symbol) as FMPRatiosTTM | undefined;
    const growthData = growth.get(symbol) as FMPFinancialGrowth | undefined;
    const estimate = estimates.get(symbol) as FMPAnalystEstimate | undefined;

    if (!quote) continue;

    // Calculate TTM values from quarterly income statements
    let ttmRevenue: number | null = null;
    let ttmEarnings: number | null = null;
    let ttmOperatingMargin: number | null = null;

    if (quarterlyIncome && quarterlyIncome.length > 0) {
      const revenue = quarterlyIncome.reduce((sum, q) => sum + (q.revenue || 0), 0);
      const netIncome = quarterlyIncome.reduce((sum, q) => sum + (q.netIncome || 0), 0);
      const operatingIncome = quarterlyIncome.reduce((sum, q) => sum + (q.operatingIncome || 0), 0);

      if (revenue > 0) {
        ttmRevenue = revenue;
        ttmOperatingMargin = operatingIncome / revenue;
      }
      if (netIncome !== 0) {
        ttmEarnings = netIncome;
      }
    }

    // Derive TTM EPS from FMP's P/E ratio for dynamic calculation later
    let ttmEPS: number | null = null;
    const peRatio = ratio?.priceToEarningsRatioTTM ?? null;
    if (peRatio && peRatio > 0 && quote.price) {
      ttmEPS = quote.price / peRatio;
    }

    // Store raw forward EPS data and calculate forward PE
    let forwardPE: number | null = null;
    let forwardEPS: number | null = null;
    let forwardEPSDate: string | null = null;

    if (estimate?.epsAvg && estimate.epsAvg > 0) {
      forwardEPS = estimate.epsAvg;
      forwardEPSDate = estimate.date;
      if (quote.price) {
        forwardPE = quote.price / estimate.epsAvg;
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
      country: profile?.country || "United States",
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

  // Step 6: Sort by market cap and assign ranks
  companies.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
  companies.forEach((c, i) => {
    (c as any).rank = i + 1;
  });

  // Step 7: Convert to DatabaseCompany format
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
type PartialUpdateType = "forward_pe" | "quotes" | "financials" | "growth" | "pe_ratio" | "week_52_high";

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
    console.log("Fetching analyst estimates...");
    const estimates = await processSymbolsBatch(symbols, fetchAnalystEstimates, "Analyst estimates");
    console.log(`  Got estimates for ${estimates.size} symbols\n`);

    // Update forward_pe and store raw EPS for each company
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const estimate = estimates.get(symbol) as FMPAnalystEstimate | undefined;
      if (estimate?.epsAvg && estimate.epsAvg > 0) {
        company.forward_eps = estimate.epsAvg;
        company.forward_eps_date = estimate.date;
        if (company.price) {
          company.forward_pe = company.price / estimate.epsAvg;
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
    console.log("Fetching quarterly income statements...");
    const incomeStatements = await processSymbolsBatch(symbols, fetchQuarterlyIncome, "Income statements");
    console.log(`  Got income statements for ${incomeStatements.size} symbols\n`);

    console.log("Fetching ratios TTM...");
    const ratios = await processSymbolsBatch(symbols, fetchRatiosTTM, "Ratios TTM");
    console.log(`  Got ratios for ${ratios.size} symbols\n`);

    // Update financial fields
    let updated = 0;
    for (const [symbol, company] of companyMap) {
      const quarterlyIncome = incomeStatements.get(symbol) as FMPIncomeStatement[] | undefined;
      const ratio = ratios.get(symbol) as FMPRatiosTTM | undefined;

      if (quarterlyIncome && quarterlyIncome.length > 0) {
        const revenue = quarterlyIncome.reduce((sum, q) => sum + (q.revenue || 0), 0);
        const netIncome = quarterlyIncome.reduce((sum, q) => sum + (q.netIncome || 0), 0);
        const operatingIncome = quarterlyIncome.reduce((sum, q) => sum + (q.operatingIncome || 0), 0);

        if (revenue > 0) {
          company.revenue = revenue;
          company.operating_margin = operatingIncome / revenue;
        }
        if (netIncome !== 0) {
          company.earnings = netIncome;
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
    const validTypes: PartialUpdateType[] = ["forward_pe", "quotes", "financials", "growth", "pe_ratio", "week_52_high"];
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
