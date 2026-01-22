import path from "path";
import fs from "fs";
import { Company, DatabaseCompany, CompaniesQueryParams } from "./types";

const dbPath = path.join(process.cwd(), "data", "companies.db");
const jsonPath = path.join(process.cwd(), "data", "companies.json");

// Cache for SQLite availability check
let sqliteAvailable: boolean | null = null;

// Check if we can use SQLite (local development) or need JSON (serverless)
function canUseSqlite(): boolean {
  if (sqliteAvailable !== null) return sqliteAvailable;

  // In Vercel serverless, better-sqlite3 won't work
  if (process.env.VERCEL) {
    sqliteAvailable = false;
    return false;
  }

  try {
    require("better-sqlite3");
    sqliteAvailable = fs.existsSync(dbPath);
    return sqliteAvailable;
  } catch {
    sqliteAvailable = false;
    return false;
  }
}

// Get database connection (only works locally)
export function getDatabase() {
  // Dynamic require to avoid bundling issues in serverless
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

// Initialize database schema (only works locally)
export function initializeDatabase() {
  const db = getDatabase();

  // Create companies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rank INTEGER,
      market_cap REAL,
      price REAL,
      daily_change_percent REAL,
      earnings REAL,
      revenue REAL,
      pe_ratio REAL,
      dividend_percent REAL,
      operating_margin REAL,
      country TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rank ON companies(rank);
    CREATE INDEX IF NOT EXISTS idx_name ON companies(name);
    CREATE INDEX IF NOT EXISTS idx_market_cap ON companies(market_cap);
  `);

  // Create price history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      date DATE NOT NULL,
      FOREIGN KEY (symbol) REFERENCES companies(symbol),
      UNIQUE(symbol, date)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_symbol_date ON price_history(symbol, date);
  `);

  db.close();
  console.log("Database initialized successfully");
}

// Convert database row to Company type
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

// JSON-based data loading for serverless
interface JsonData {
  companies: DatabaseCompany[];
  lastUpdated: string | null;
  exportedAt: string;
}

function loadJsonData(): JsonData {
  const data = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(data);
}

function getCompaniesFromJson(params: CompaniesQueryParams = {}): { companies: Company[]; total: number } {
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

// Get all companies with filtering and sorting
export function getCompanies(params: CompaniesQueryParams = {}): { companies: Company[]; total: number } {
  // Use JSON in serverless environment
  if (!canUseSqlite()) {
    return getCompaniesFromJson(params);
  }

  const db = getDatabase();

  const {
    search,
    sortBy = "rank",
    sortOrder = "asc",
    minMarketCap,
    maxMarketCap,
    limit = 100,
    offset = 0,
  } = params;

  const whereClauses: string[] = [];
  const queryParams: (string | number)[] = [];

  // Add search filter
  if (search) {
    whereClauses.push("(LOWER(name) LIKE ? OR LOWER(symbol) LIKE ?)");
    const searchTerm = `%${search.toLowerCase()}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  // Add market cap filters
  if (minMarketCap !== undefined) {
    whereClauses.push("market_cap >= ?");
    queryParams.push(minMarketCap);
  }

  if (maxMarketCap !== undefined) {
    whereClauses.push("market_cap <= ?");
    queryParams.push(maxMarketCap);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Map sortBy to database column names
  const columnMap: Record<string, string> = {
    symbol: "symbol",
    name: "name",
    rank: "rank",
    marketCap: "market_cap",
    price: "price",
    dailyChangePercent: "daily_change_percent",
    earnings: "earnings",
    revenue: "revenue",
    peRatio: "pe_ratio",
    dividendPercent: "dividend_percent",
    operatingMargin: "operating_margin",
  };

  const sortColumn = columnMap[sortBy] || "rank";
  const order = sortOrder.toUpperCase();

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM companies ${whereClause}`;
  const countResult = db.prepare(countQuery).get(...queryParams) as { count: number };
  const total = countResult.count;

  // Get companies
  const query = `
    SELECT * FROM companies
    ${whereClause}
    ORDER BY ${sortColumn} ${order}
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(query).all(...queryParams, limit, offset) as DatabaseCompany[];
  const companies = rows.map(dbRowToCompany);

  db.close();
  return { companies, total };
}

// Get a single company by symbol
export function getCompanyBySymbol(symbol: string): Company | null {
  if (!canUseSqlite()) {
    const jsonData = loadJsonData();
    const row = jsonData.companies.find((c) => c.symbol === symbol);
    return row ? dbRowToCompany(row) : null;
  }

  const db = getDatabase();
  const row = db.prepare("SELECT * FROM companies WHERE symbol = ?").get(symbol) as DatabaseCompany | undefined;
  db.close();

  return row ? dbRowToCompany(row) : null;
}

// Upsert company data (SQLite only - for scraper)
export function upsertCompany(company: Partial<Company> & { symbol: string }): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO companies (
      symbol, name, rank, market_cap, price, daily_change_percent,
      earnings, revenue, pe_ratio, dividend_percent, operating_margin,
      country, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      rank = excluded.rank,
      market_cap = excluded.market_cap,
      price = excluded.price,
      daily_change_percent = excluded.daily_change_percent,
      earnings = excluded.earnings,
      revenue = excluded.revenue,
      pe_ratio = excluded.pe_ratio,
      dividend_percent = excluded.dividend_percent,
      operating_margin = excluded.operating_margin,
      country = excluded.country,
      last_updated = CURRENT_TIMESTAMP
  `);

  stmt.run(
    company.symbol,
    company.name || "",
    company.rank ?? null,
    company.marketCap ?? null,
    company.price ?? null,
    company.dailyChangePercent ?? null,
    company.earnings ?? null,
    company.revenue ?? null,
    company.peRatio ?? null,
    company.dividendPercent ?? null,
    company.operatingMargin ?? null,
    company.country || "United States"
  );

  db.close();
}

// Batch upsert companies (SQLite only - for scraper)
export function upsertCompanies(companies: Array<Partial<Company> & { symbol: string }>): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO companies (
      symbol, name, rank, market_cap, price, daily_change_percent,
      earnings, revenue, pe_ratio, dividend_percent, operating_margin,
      country, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      rank = excluded.rank,
      market_cap = excluded.market_cap,
      price = excluded.price,
      daily_change_percent = excluded.daily_change_percent,
      earnings = excluded.earnings,
      revenue = excluded.revenue,
      pe_ratio = excluded.pe_ratio,
      dividend_percent = excluded.dividend_percent,
      operating_margin = excluded.operating_margin,
      country = excluded.country,
      last_updated = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction((companies: Array<Partial<Company> & { symbol: string }>) => {
    for (const company of companies) {
      stmt.run(
        company.symbol,
        company.name || "",
        company.rank ?? null,
        company.marketCap ?? null,
        company.price ?? null,
        company.dailyChangePercent ?? null,
        company.earnings ?? null,
        company.revenue ?? null,
        company.peRatio ?? null,
        company.dividendPercent ?? null,
        company.operatingMargin ?? null,
        company.country || "United States"
      );
    }
  });

  transaction(companies);
  db.close();
}

// Add price history entry (SQLite only - for scraper)
export function addPriceHistory(symbol: string, price: number, date: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO price_history (symbol, price, date)
    VALUES (?, ?, ?)
  `);

  stmt.run(symbol, price, date);
  db.close();
}

// Get previous day's price (SQLite only - for scraper)
export function getPreviousPrice(symbol: string, currentDate: string): number | null {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT price FROM price_history
    WHERE symbol = ? AND date < ?
    ORDER BY date DESC
    LIMIT 1
  `).get(symbol, currentDate) as { price: number } | undefined;

  db.close();
  return row ? row.price : null;
}

// Calculate and update daily change percent (SQLite only - for scraper)
export function calculateDailyChange(symbol: string, currentPrice: number, currentDate: string): number | null {
  const previousPrice = getPreviousPrice(symbol, currentDate);

  if (!previousPrice || previousPrice === 0) {
    return null;
  }

  const changePercent = ((currentPrice - previousPrice) / previousPrice) * 100;
  return Math.round(changePercent * 100) / 100; // Round to 2 decimal places
}

// Get last updated timestamp
export function getLastUpdated(): string | null {
  if (!canUseSqlite()) {
    const jsonData = loadJsonData();
    return jsonData.lastUpdated;
  }

  const db = getDatabase();

  const row = db.prepare(`
    SELECT last_updated FROM companies
    ORDER BY last_updated DESC
    LIMIT 1
  `).get() as { last_updated: string } | undefined;

  db.close();
  return row ? row.last_updated : null;
}
