import path from "path";
import fs from "fs";
import { Company, DatabaseCompany, CompaniesQueryParams, PriceQuote } from "./types";

const jsonPath = path.join(process.cwd(), "data", "companies.json");

// JSON data structure
interface JsonData {
  companies: DatabaseCompany[];
  lastUpdated: string | null;
  exportedAt: string;
}

function calculatePctTo52WeekHigh(price: number | null, week52High: number | null): number | null {
  if (price === null || week52High === null || price <= 0) {
    return null;
  }
  return ((week52High - price) / price) * 100;
}

function calculateForwardEPSGrowth(forwardEPS: number | null, ttmEPS: number | null): number | null {
  if (forwardEPS === null || ttmEPS === null || forwardEPS <= 0 || ttmEPS <= 0) {
    return null;
  }
  return (forwardEPS / ttmEPS) - 1;
}

// Cache for blob data to avoid repeated fetches within a request
let blobDataCache: { data: JsonData; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache (data updates daily via scraper)

// Convert JSON record to Company type
function dbRowToCompany(row: DatabaseCompany): Company {
  const week52High = row.week_52_high ?? null;
  const price = row.price;
  return {
    symbol: row.symbol,
    name: row.name,
    rank: row.rank ?? 0,
    marketCap: row.market_cap,
    price,
    week52High,
    pctTo52WeekHigh: calculatePctTo52WeekHigh(price, week52High),
    dailyChangePercent: row.daily_change_percent,
    earnings: row.earnings,
    revenue: row.revenue,
    revenueAnnual: row.revenue_annual ?? null,
    epsAnnual: row.eps_annual ?? null,
    peRatio: row.pe_ratio,
    ttmEPS: row.ttm_eps ?? null,
    forwardPE: row.forward_pe ?? null,
    forwardEPS: row.forward_eps ?? null,
    forwardEPSDate: row.forward_eps_date ?? null,
    forwardEPSGrowth: calculateForwardEPSGrowth(row.forward_eps ?? null, row.ttm_eps ?? null),
    dividendPercent: row.dividend_percent,
    operatingMargin: row.operating_margin,
    revenueGrowth5Y: row.revenue_growth_5y ?? null,
    revenueGrowth3Y: row.revenue_growth_3y ?? null,
    epsGrowth5Y: row.eps_growth_5y ?? null,
    epsGrowth3Y: row.eps_growth_3y ?? null,
    freeCashFlow: row.free_cash_flow ?? null,
    netDebt: row.net_debt ?? null,
    country: row.country,
    lastUpdated: row.last_updated,
  };
}

export function mergeLiveQuotes(
  companies: Company[],
  quotes: Map<string, PriceQuote>,
  options: { recomputeRanks?: boolean } = {}
): Company[] {
  const merged = companies.map((company) => {
    const quote = quotes.get(company.symbol);
    if (!quote) {
      return { ...company };
    }

    const livePrice = quote.price ?? company.price;

    // Dynamically calculate forwardPE using live price
    let dynamicForwardPE = company.forwardPE;
    if (livePrice && company.forwardEPS && company.forwardEPS > 0) {
      dynamicForwardPE = livePrice / company.forwardEPS;
    }

    // Dynamically calculate peRatio using live price
    let dynamicPERatio = company.peRatio;
    if (livePrice && company.ttmEPS && company.ttmEPS > 0) {
      dynamicPERatio = livePrice / company.ttmEPS;
    }

    return {
      ...company,
      // Current dataset symbols are US-listed shares/ADRs, so Yahoo's USD market cap aligns with storage.
      marketCap: quote.marketCap ?? company.marketCap,
      price: livePrice,
      pctTo52WeekHigh: calculatePctTo52WeekHigh(livePrice, company.week52High),
      dailyChangePercent: quote.changePercent ?? company.dailyChangePercent,
      peRatio: dynamicPERatio,
      forwardPE: dynamicForwardPE,
    };
  });

  if (options.recomputeRanks) {
    const ranksBySymbol = new Map<string, number>();
    [...merged]
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .forEach((company, index) => {
        ranksBySymbol.set(company.symbol, index + 1);
      });

    return merged.map((company) => ({
      ...company,
      rank: ranksBySymbol.get(company.symbol) ?? company.rank,
    }));
  }

  return merged;
}

// Convert Company to JSON storage format
function companyToDbRow(company: Partial<Company> & { symbol: string }, lastUpdated: string): DatabaseCompany {
  return {
    symbol: company.symbol,
    name: company.name || "",
    rank: company.rank ?? null,
    market_cap: company.marketCap ?? null,
    price: company.price ?? null,
    week_52_high: company.week52High ?? null,
    daily_change_percent: company.dailyChangePercent ?? null,
    earnings: company.earnings ?? null,
    revenue: company.revenue ?? null,
    revenue_annual: company.revenueAnnual ?? null,
    eps_annual: company.epsAnnual ?? null,
    pe_ratio: company.peRatio ?? null,
    ttm_eps: company.ttmEPS ?? null,
    forward_pe: company.forwardPE ?? null,
    forward_eps: company.forwardEPS ?? null,
    forward_eps_date: company.forwardEPSDate ?? null,
    dividend_percent: company.dividendPercent ?? null,
    operating_margin: company.operatingMargin ?? null,
    revenue_growth_5y: company.revenueGrowth5Y ?? null,
    revenue_growth_3y: company.revenueGrowth3Y ?? null,
    eps_growth_5y: company.epsGrowth5Y ?? null,
    eps_growth_3y: company.epsGrowth3Y ?? null,
    free_cash_flow: company.freeCashFlow ?? null,
    net_debt: company.netDebt ?? null,
    country: company.country || "",
    last_updated: lastUpdated,
  };
}

// Load JSON data from Vercel Blob in production, local file in development
async function loadJsonDataAsync(): Promise<JsonData> {
  const blobUrl = process.env.BLOB_URL;

  if (blobUrl) {
    // Check cache first
    if (blobDataCache && Date.now() - blobDataCache.fetchedAt < CACHE_TTL_MS) {
      return blobDataCache.data;
    }

    // Fetch from Vercel Blob
    // Use no-store to avoid stale Data Cache; in-memory blobDataCache handles request caching
    const response = await fetch(blobUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from Blob: ${response.status}`);
    }

    const data = await response.json();
    blobDataCache = { data, fetchedAt: Date.now() };
    return data;
  }

  // Fallback to local file for development
  return loadJsonDataSync();
}

// Synchronous load for backward compatibility (local development)
function loadJsonDataSync(): JsonData {
  const data = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(data);
}

// Write companies to JSON file (used by scraper)
export function writeCompanies(
  companies: Array<Partial<Company> & { symbol: string }>,
  lastUpdated: string | null = null
): void {
  const timestamp = lastUpdated || new Date().toISOString();

  const dbCompanies = companies.map((c) => companyToDbRow(c, timestamp));

  const jsonData: JsonData = {
    companies: dbCompanies,
    lastUpdated: timestamp,
    exportedAt: new Date().toISOString(),
  };

  // Ensure data directory exists
  const dataDir = path.dirname(jsonPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
}

// Get all companies with filtering and sorting
// Optional quotes parameter allows live price data to be used for sorting
export async function getCompanies(
  params: CompaniesQueryParams = {},
  quotes?: Map<string, PriceQuote>
): Promise<{ companies: Company[]; total: number }> {
  const jsonData = await loadJsonDataAsync();

  let companies = jsonData.companies.map(dbRowToCompany);

  // If quotes provided, merge live data before thresholding, filtering, sorting, and display.
  if (quotes) {
    companies = mergeLiveQuotes(companies, quotes, { recomputeRanks: true });
  }

  // Source data only contains scrape-time $1B+ companies, so live quotes can
  // remove names below $1B but cannot add new entrants until the next scrape.
  companies = companies.filter(
    (c) => c.marketCap !== null && c.marketCap >= 1_000_000_000
  );

  const {
    search,
    sortBy = "rank",
    sortOrder = "asc",
    minMarketCap,
    maxMarketCap,
    minEarnings,
    maxEarnings,
    minRevenue,
    maxRevenue,
    minPERatio,
    maxPERatio,
    minForwardPE,
    maxForwardPE,
    minForwardEPSGrowth,
    maxForwardEPSGrowth,
    minDividend,
    maxDividend,
    minOperatingMargin,
    maxOperatingMargin,
    minRevenueGrowth,
    maxRevenueGrowth,
    minRevenueGrowth3Y,
    maxRevenueGrowth3Y,
    minEPSGrowth,
    maxEPSGrowth,
    minEPSGrowth3Y,
    maxEPSGrowth3Y,
    minPctTo52WeekHigh,
    maxPctTo52WeekHigh,
    minFreeCashFlow,
    maxFreeCashFlow,
    minNetDebt,
    maxNetDebt,
    country,
    limit = 100,
    offset = 0,
  } = params;

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase();
    companies = companies.filter(
      (c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.symbol.toLowerCase().includes(searchLower)
    );
  }

  // Apply country filter
  if (country) {
    companies = companies.filter((c) => c.country === country);
  }

  // Apply market cap filters (values in billions, stored in raw)
  if (minMarketCap !== undefined) {
    const minRaw = minMarketCap * 1_000_000_000;
    companies = companies.filter((c) => c.marketCap !== null && c.marketCap >= minRaw);
  }
  if (maxMarketCap !== undefined) {
    const maxRaw = maxMarketCap * 1_000_000_000;
    companies = companies.filter((c) => c.marketCap !== null && c.marketCap <= maxRaw);
  }

  // Apply earnings filters (values in billions, stored in raw)
  if (minEarnings !== undefined) {
    const minRaw = minEarnings * 1_000_000_000;
    companies = companies.filter((c) => c.earnings !== null && c.earnings >= minRaw);
  }
  if (maxEarnings !== undefined) {
    const maxRaw = maxEarnings * 1_000_000_000;
    companies = companies.filter((c) => c.earnings !== null && c.earnings <= maxRaw);
  }

  // Apply revenue filters (values in billions, stored in raw)
  if (minRevenue !== undefined) {
    const minRaw = minRevenue * 1_000_000_000;
    companies = companies.filter((c) => c.revenue !== null && c.revenue >= minRaw);
  }
  if (maxRevenue !== undefined) {
    const maxRaw = maxRevenue * 1_000_000_000;
    companies = companies.filter((c) => c.revenue !== null && c.revenue <= maxRaw);
  }

  // Apply free cash flow filters (TTM, values in billions, stored in raw)
  if (minFreeCashFlow !== undefined) {
    const minRaw = minFreeCashFlow * 1_000_000_000;
    companies = companies.filter((c) => c.freeCashFlow !== null && c.freeCashFlow >= minRaw);
  }
  if (maxFreeCashFlow !== undefined) {
    const maxRaw = maxFreeCashFlow * 1_000_000_000;
    companies = companies.filter((c) => c.freeCashFlow !== null && c.freeCashFlow <= maxRaw);
  }

  // Apply net debt filters (values in billions, stored in raw; negative = net cash)
  if (minNetDebt !== undefined) {
    const minRaw = minNetDebt * 1_000_000_000;
    companies = companies.filter((c) => c.netDebt !== null && c.netDebt >= minRaw);
  }
  if (maxNetDebt !== undefined) {
    const maxRaw = maxNetDebt * 1_000_000_000;
    companies = companies.filter((c) => c.netDebt !== null && c.netDebt <= maxRaw);
  }

  // Apply P/E ratio filters
  if (minPERatio !== undefined) {
    companies = companies.filter((c) => c.peRatio !== null && c.peRatio >= minPERatio);
  }
  if (maxPERatio !== undefined) {
    companies = companies.filter((c) => c.peRatio !== null && c.peRatio <= maxPERatio);
  }

  // Apply dividend filters
  if (minDividend !== undefined) {
    companies = companies.filter((c) => c.dividendPercent !== null && c.dividendPercent >= minDividend);
  }
  if (maxDividend !== undefined) {
    companies = companies.filter((c) => c.dividendPercent !== null && c.dividendPercent <= maxDividend);
  }

  // Apply operating margin filters
  if (minOperatingMargin !== undefined) {
    companies = companies.filter((c) => c.operatingMargin !== null && c.operatingMargin >= minOperatingMargin);
  }
  if (maxOperatingMargin !== undefined) {
    companies = companies.filter((c) => c.operatingMargin !== null && c.operatingMargin <= maxOperatingMargin);
  }

  // Apply forward PE filters
  if (minForwardPE !== undefined) {
    companies = companies.filter((c) => c.forwardPE !== null && c.forwardPE >= minForwardPE);
  }
  if (maxForwardPE !== undefined) {
    companies = companies.filter((c) => c.forwardPE !== null && c.forwardPE <= maxForwardPE);
  }

  // Apply forward EPS growth filters (values as decimals, e.g., 0.10 = 10%)
  if (minForwardEPSGrowth !== undefined) {
    companies = companies.filter((c) => c.forwardEPSGrowth !== null && c.forwardEPSGrowth >= minForwardEPSGrowth);
  }
  if (maxForwardEPSGrowth !== undefined) {
    companies = companies.filter((c) => c.forwardEPSGrowth !== null && c.forwardEPSGrowth <= maxForwardEPSGrowth);
  }

  // Apply revenue growth filters (values as decimals, e.g., 0.10 = 10%)
  if (minRevenueGrowth !== undefined) {
    companies = companies.filter((c) => c.revenueGrowth5Y !== null && c.revenueGrowth5Y >= minRevenueGrowth);
  }
  if (maxRevenueGrowth !== undefined) {
    companies = companies.filter((c) => c.revenueGrowth5Y !== null && c.revenueGrowth5Y <= maxRevenueGrowth);
  }

  // Apply EPS growth filters (values as decimals, e.g., 0.10 = 10%)
  if (minEPSGrowth !== undefined) {
    companies = companies.filter((c) => c.epsGrowth5Y !== null && c.epsGrowth5Y >= minEPSGrowth);
  }
  if (maxEPSGrowth !== undefined) {
    companies = companies.filter((c) => c.epsGrowth5Y !== null && c.epsGrowth5Y <= maxEPSGrowth);
  }

  // Apply 3Y revenue growth filters (values as decimals, e.g., 0.10 = 10%)
  if (minRevenueGrowth3Y !== undefined) {
    companies = companies.filter((c) => c.revenueGrowth3Y !== null && c.revenueGrowth3Y >= minRevenueGrowth3Y);
  }
  if (maxRevenueGrowth3Y !== undefined) {
    companies = companies.filter((c) => c.revenueGrowth3Y !== null && c.revenueGrowth3Y <= maxRevenueGrowth3Y);
  }

  // Apply 3Y EPS growth filters (values as decimals, e.g., 0.10 = 10%)
  if (minEPSGrowth3Y !== undefined) {
    companies = companies.filter((c) => c.epsGrowth3Y !== null && c.epsGrowth3Y >= minEPSGrowth3Y);
  }
  if (maxEPSGrowth3Y !== undefined) {
    companies = companies.filter((c) => c.epsGrowth3Y !== null && c.epsGrowth3Y <= maxEPSGrowth3Y);
  }

  // Apply % to 52W high filters (values as percentage points, e.g., 20 = 20%)
  if (minPctTo52WeekHigh !== undefined) {
    companies = companies.filter((c) => c.pctTo52WeekHigh !== null && c.pctTo52WeekHigh >= minPctTo52WeekHigh);
  }
  if (maxPctTo52WeekHigh !== undefined) {
    companies = companies.filter((c) => c.pctTo52WeekHigh !== null && c.pctTo52WeekHigh <= maxPctTo52WeekHigh);
  }

  const total = companies.length;

  // Apply sorting
  companies.sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    const numA = Number(aVal);
    const numB = Number(bVal);
    return sortOrder === "asc" ? numA - numB : numB - numA;
  });

  // Apply pagination
  companies = companies.slice(offset, offset + limit);

  return { companies, total };
}

// Get a single company by symbol
export async function getCompanyBySymbol(symbol: string): Promise<Company | null> {
  const jsonData = await loadJsonDataAsync();
  const row = jsonData.companies.find((c) => c.symbol === symbol);
  return row ? dbRowToCompany(row) : null;
}

// Get multiple companies by symbols (case-insensitive)
export async function getCompaniesBySymbols(symbols: string[]): Promise<Map<string, Company>> {
  const jsonData = await loadJsonDataAsync();
  const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));
  const result = new Map<string, Company>();
  for (const row of jsonData.companies) {
    if (symbolSet.has(row.symbol.toUpperCase())) {
      result.set(row.symbol, dbRowToCompany(row));
    }
  }
  return result;
}

// Get last updated timestamp
export async function getLastUpdated(): Promise<string | null> {
  const jsonData = await loadJsonDataAsync();
  return jsonData.lastUpdated;
}

// Get all company symbols (for fetching quotes)
export async function getAllSymbols(): Promise<string[]> {
  const jsonData = await loadJsonDataAsync();
  return jsonData.companies.map((c) => c.symbol);
}

// Get distinct country values for the country filter dropdown
export async function getDistinctCountries(): Promise<string[]> {
  const jsonData = await loadJsonDataAsync();
  const countries = new Set(jsonData.companies.map((c) => c.country).filter(Boolean));
  return Array.from(countries).sort();
}
