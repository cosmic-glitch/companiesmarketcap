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

// Cache for blob data to avoid repeated fetches within a request
let blobDataCache: { data: JsonData; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

// Convert JSON record to Company type
function dbRowToCompany(row: DatabaseCompany): Company {
  return {
    symbol: row.symbol,
    name: row.name,
    rank: row.rank ?? 0,
    marketCap: row.market_cap,
    price: row.price,
    dailyChangePercent: row.daily_change_percent,
    earnings: row.earnings,
    revenue: row.revenue,
    peRatio: row.pe_ratio,
    forwardPE: row.forward_pe ?? null,
    forwardEPS: row.forward_eps ?? null,
    forwardEPSDate: row.forward_eps_date ?? null,
    dividendPercent: row.dividend_percent,
    operatingMargin: row.operating_margin,
    revenueGrowth5Y: row.revenue_growth_5y ?? null,
    revenueGrowth3Y: row.revenue_growth_3y ?? null,
    epsGrowth5Y: row.eps_growth_5y ?? null,
    epsGrowth3Y: row.eps_growth_3y ?? null,
    country: row.country,
    lastUpdated: row.last_updated,
  };
}

// Convert Company to JSON storage format
function companyToDbRow(company: Partial<Company> & { symbol: string }, lastUpdated: string): DatabaseCompany {
  return {
    symbol: company.symbol,
    name: company.name || "",
    rank: company.rank ?? null,
    market_cap: company.marketCap ?? null,
    price: company.price ?? null,
    daily_change_percent: company.dailyChangePercent ?? null,
    earnings: company.earnings ?? null,
    revenue: company.revenue ?? null,
    pe_ratio: company.peRatio ?? null,
    forward_pe: company.forwardPE ?? null,
    forward_eps: company.forwardEPS ?? null,
    forward_eps_date: company.forwardEPSDate ?? null,
    dividend_percent: company.dividendPercent ?? null,
    operating_margin: company.operatingMargin ?? null,
    revenue_growth_5y: company.revenueGrowth5Y ?? null,
    revenue_growth_3y: company.revenueGrowth3Y ?? null,
    eps_growth_5y: company.epsGrowth5Y ?? null,
    eps_growth_3y: company.epsGrowth3Y ?? null,
    country: company.country || "United States",
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

  // If quotes provided, merge live data into companies
  if (quotes) {
    companies = companies.map((company) => {
      const quote = quotes.get(company.symbol);
      if (quote) {
        const livePrice = quote.price ?? company.price;

        // Dynamically calculate forwardPE using live price
        let dynamicForwardPE = company.forwardPE;
        if (livePrice && company.forwardEPS && company.forwardEPS > 0) {
          dynamicForwardPE = livePrice / company.forwardEPS;
        }

        return {
          ...company,
          price: livePrice,
          dailyChangePercent: quote.changePercent ?? company.dailyChangePercent,
          forwardPE: dynamicForwardPE,
        };
      }
      return company;
    });
  }

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
