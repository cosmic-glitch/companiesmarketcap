// Price quote from Yahoo Finance
export interface PriceQuote {
  price: number | null;
  changePercent: number | null;
}

// Company data types
export interface Company {
  symbol: string;
  name: string;
  rank: number;
  marketCap: number | null;
  price: number | null;
  dailyChangePercent: number | null;
  earnings: number | null;
  revenue: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  dividendPercent: number | null;
  operatingMargin: number | null;
  revenueGrowth5Y: number | null; // 5-year CAGR
  epsGrowth5Y: number | null; // 5-year CAGR
  country: string;
  lastUpdated: string;
}

// CSV row types for parsing
export interface MarketCapCSVRow {
  Rank: string;
  Name: string;
  Symbol: string;
  marketcap: string;
  "price (USD)": string;
  country: string;
}

export interface EarningsCSVRow {
  Rank: string;
  Name: string;
  Symbol: string;
  Earnings: string;
  Price: string;
  Today: string;
  "Price (30 days)": string;
  Country: string;
}

export interface RevenueCSVRow {
  Rank: string;
  Name: string;
  Symbol: string;
  Revenue: string;
  Price: string;
  Today: string;
  "Price (30 days)": string;
  Country: string;
}

export interface PERatioCSVRow {
  Rank: string;
  Name: string;
  Symbol: string;
  "P/E ratio": string;
  Price: string;
  Today: string;
  "Price (30 days)": string;
  Country: string;
}

export interface DividendCSVRow {
  Rank: string;
  Name: string;
  Symbol: string;
  "Dividend %": string;
  Price: string;
  Today: string;
  "Price (30 days)": string;
  Country: string;
}

export interface OperatingMarginCSVRow {
  Rank: string;
  Name: string;
  Symbol: string;
  "Operating Margin": string;
  Price: string;
  Today: string;
  "Price (30 days)": string;
  Country: string;
}

// API query parameters
export interface CompaniesQueryParams {
  search?: string;
  sortBy?: keyof Company;
  sortOrder?: "asc" | "desc";
  minMarketCap?: number;
  maxMarketCap?: number;
  minEarnings?: number;
  maxEarnings?: number;
  minPERatio?: number;
  maxPERatio?: number;
  minForwardPE?: number;
  maxForwardPE?: number;
  minDividend?: number;
  maxDividend?: number;
  minOperatingMargin?: number;
  maxOperatingMargin?: number;
  minRevenueGrowth?: number;
  maxRevenueGrowth?: number;
  minEPSGrowth?: number;
  maxEPSGrowth?: number;
  limit?: number;
  offset?: number;
}

// API response types
export interface CompaniesResponse {
  companies: Company[];
  total: number;
  page: number;
  perPage: number;
  lastUpdated?: string;
}

// Database types
export interface DatabaseCompany {
  symbol: string;
  name: string;
  rank: number | null;
  market_cap: number | null;
  price: number | null;
  daily_change_percent: number | null;
  earnings: number | null;
  revenue: number | null;
  pe_ratio: number | null;
  dividend_percent: number | null;
  operating_margin: number | null;
  country: string;
  last_updated: string;
}

// CSV source configuration
export interface CSVSource {
  name: string;
  url: string;
  metricField?: string;
}

// FMP API data types
export interface FMPCompanyData {
  symbol: string;
  revenueGrowth5Y: number | null; // 5-year CAGR
  epsGrowth5Y: number | null; // 5-year CAGR
  forwardPE: number | null;
  lastUpdated: string;
}

export interface FMPDataStore {
  companies: Record<string, FMPCompanyData>;
  lastUpdated: string;
}
