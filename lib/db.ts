import path from "path";
import fs from "fs";
import { Company, DatabaseCompany, CompaniesQueryParams } from "./types";

const jsonPath = path.join(process.cwd(), "data", "companies.json");

// JSON data structure
interface JsonData {
  companies: DatabaseCompany[];
  lastUpdated: string | null;
  exportedAt: string;
}

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
    dividendPercent: row.dividend_percent,
    operatingMargin: row.operating_margin,
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
    dividend_percent: company.dividendPercent ?? null,
    operating_margin: company.operatingMargin ?? null,
    country: company.country || "United States",
    last_updated: lastUpdated,
  };
}

// Load JSON data from file
function loadJsonData(): JsonData {
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
export function getCompanies(params: CompaniesQueryParams = {}): { companies: Company[]; total: number } {
  const jsonData = loadJsonData();
  let companies = jsonData.companies.map(dbRowToCompany);

  const {
    search,
    sortBy = "rank",
    sortOrder = "asc",
    minMarketCap,
    maxMarketCap,
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

  // Apply market cap filters
  if (minMarketCap !== undefined) {
    companies = companies.filter((c) => c.marketCap !== null && c.marketCap >= minMarketCap);
  }
  if (maxMarketCap !== undefined) {
    companies = companies.filter((c) => c.marketCap !== null && c.marketCap <= maxMarketCap);
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
export function getCompanyBySymbol(symbol: string): Company | null {
  const jsonData = loadJsonData();
  const row = jsonData.companies.find((c) => c.symbol === symbol);
  return row ? dbRowToCompany(row) : null;
}

// Get last updated timestamp
export function getLastUpdated(): string | null {
  const jsonData = loadJsonData();
  return jsonData.lastUpdated;
}
