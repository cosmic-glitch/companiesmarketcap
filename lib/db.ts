import Database from "better-sqlite3";
import path from "path";
import { Company, DatabaseCompany, PriceHistory, CompaniesQueryParams } from "./types";

const dbPath = path.join(process.cwd(), "data", "companies.db");

// Get database connection
export function getDatabase() {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

// Initialize database schema
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

// Get all companies with filtering and sorting
export function getCompanies(params: CompaniesQueryParams = {}): { companies: Company[]; total: number } {
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

  let whereClauses: string[] = [];
  let queryParams: any[] = [];

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
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM companies WHERE symbol = ?").get(symbol) as DatabaseCompany | undefined;
  db.close();

  return row ? dbRowToCompany(row) : null;
}

// Upsert company data
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

// Batch upsert companies
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

  const transaction = db.transaction((companies) => {
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

// Add price history entry
export function addPriceHistory(symbol: string, price: number, date: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO price_history (symbol, price, date)
    VALUES (?, ?, ?)
  `);

  stmt.run(symbol, price, date);
  db.close();
}

// Get previous day's price
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

// Calculate and update daily change percent
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
  const db = getDatabase();

  const row = db.prepare(`
    SELECT last_updated FROM companies
    ORDER BY last_updated DESC
    LIMIT 1
  `).get() as { last_updated: string } | undefined;

  db.close();
  return row ? row.last_updated : null;
}
