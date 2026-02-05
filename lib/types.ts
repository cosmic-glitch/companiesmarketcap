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
  week52High: number | null;
  pctTo52WeekHigh: number | null;
  dailyChangePercent: number | null;
  earnings: number | null;
  revenue: number | null;
  peRatio: number | null;
  ttmEPS: number | null;  // TTM earnings per share (derived from FMP P/E ratio)
  forwardPE: number | null;
  forwardEPS: number | null;      // Raw EPS estimate
  forwardEPSDate: string | null;  // Fiscal year end date (e.g., "2026-12-31")
  dividendPercent: number | null;
  operatingMargin: number | null;
  revenueGrowth5Y: number | null; // 5-year CAGR
  revenueGrowth3Y: number | null; // 3-year CAGR
  epsGrowth5Y: number | null; // 5-year CAGR
  epsGrowth3Y: number | null; // 3-year CAGR
  country: string;
  lastUpdated: string;
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
  minRevenue?: number;
  maxRevenue?: number;
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
  minRevenueGrowth3Y?: number;
  maxRevenueGrowth3Y?: number;
  minEPSGrowth?: number;
  maxEPSGrowth?: number;
  minEPSGrowth3Y?: number;
  maxEPSGrowth3Y?: number;
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

// Database types (JSON storage format)
export interface DatabaseCompany {
  symbol: string;
  name: string;
  rank: number | null;
  market_cap: number | null;
  price: number | null;
  week_52_high: number | null;
  daily_change_percent: number | null;
  earnings: number | null;
  revenue: number | null;
  pe_ratio: number | null;
  ttm_eps: number | null;
  forward_pe: number | null;
  forward_eps: number | null;
  forward_eps_date: string | null;
  dividend_percent: number | null;
  operating_margin: number | null;
  revenue_growth_5y: number | null;
  revenue_growth_3y: number | null;
  eps_growth_5y: number | null;
  eps_growth_3y: number | null;
  country: string;
  last_updated: string;
}
