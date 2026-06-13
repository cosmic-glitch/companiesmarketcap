import { formatCountry } from "@/lib/countries";

// Shared formatting for the active-filter summary. Lives here (rather than in
// the page) so both the server page and the client table can render identical
// labels from whichever param source they have (alias-aware getter).

type Getter = (key: string) => string | undefined | null;

export const SORT_LABELS: Record<string, string> = {
  rank: "market capitalization",
  marketCap: "market capitalization",
  name: "name",
  price: "price",
  dailyChangePercent: "daily change",
  pctTo52WeekHigh: "% to 52W High",
  earnings: "earnings",
  revenue: "revenue",
  peRatio: "P/E ratio",
  forwardPE: "Fwd PE",
  forwardEPSGrowth: "Fwd EPS Growth",
  dividendPercent: "Div Yield",
  operatingMargin: "Op Margin",
  revenueGrowth5Y: "Rev Growth 5Y",
  revenueGrowth3Y: "Rev Growth 3Y",
  epsGrowth5Y: "EPS Growth 5Y",
  epsGrowth3Y: "EPS Growth 3Y",
  freeCashFlow: "FCF",
  netDebt: "Net Debt",
};

export function sortLabelFor(sortBy: string): string {
  return SORT_LABELS[sortBy] || "market capitalization";
}

// Builds a human-readable list of the currently-applied filter criteria.
// Order is fixed (market cap first, then valuation, profitability, growth,
// then categorical filters) so the summary reads consistently.
export function buildFilterDescriptions(getRaw: Getter): string[] {
  const get = (key: string): string | undefined => {
    const v = getRaw(key);
    return v === null || v === undefined || v === "" ? undefined : v;
  };

  const descriptions: string[] = [];

  // Range helper: "min < label < max", "label > min", or "label < max".
  const addFilter = (label: string, min: string | undefined, max: string | undefined, suffix = "") => {
    if (min && max) {
      descriptions.push(`${min}${suffix} < ${label} < ${max}${suffix}`);
    } else if (min) {
      descriptions.push(`${label} > ${min}${suffix}`);
    } else if (max) {
      descriptions.push(`${label} < ${max}${suffix}`);
    }
  };

  // Market Cap (special formatting for $B/$T)
  const formatMktCap = (val: string) => {
    const num = parseFloat(val);
    return num >= 1000 ? `$${num / 1000}T` : `$${num}B`;
  };
  const minMarketCap = get("minMarketCap");
  const maxMarketCap = get("maxMarketCap");
  if (minMarketCap && maxMarketCap) {
    descriptions.push(`${formatMktCap(minMarketCap)} < Mkt Cap < ${formatMktCap(maxMarketCap)}`);
  } else if (minMarketCap) {
    descriptions.push(`Mkt Cap > ${formatMktCap(minMarketCap)}`);
  } else if (maxMarketCap) {
    descriptions.push(`Mkt Cap < ${formatMktCap(maxMarketCap)}`);
  }

  addFilter("Fwd PE", get("minForwardPE"), get("maxForwardPE"));
  addFilter("Fwd EPS Growth", get("minForwardEPSGrowth"), get("maxForwardEPSGrowth"), "%");
  addFilter("P/E", get("minPERatio"), get("maxPERatio"));
  addFilter("Div Yield", get("minDividend"), get("maxDividend"), "%");
  addFilter("Op Margin", get("minOperatingMargin"), get("maxOperatingMargin"), "%");
  addFilter("Rev Growth 5Y", get("minRevenueGrowth"), get("maxRevenueGrowth"), "%");
  addFilter("Rev Growth 3Y", get("minRevenueGrowth3Y"), get("maxRevenueGrowth3Y"), "%");
  addFilter("EPS Growth 5Y", get("minEPSGrowth"), get("maxEPSGrowth"), "%");
  addFilter("EPS Growth 3Y", get("minEPSGrowth3Y"), get("maxEPSGrowth3Y"), "%");
  addFilter("% to 52W High", get("minPctTo52WeekHigh"), get("maxPctTo52WeekHigh"), "%");
  addFilter("Earnings", get("minEarnings"), get("maxEarnings"), "B");
  addFilter("Revenue", get("minRevenue"), get("maxRevenue"), "B");
  addFilter("FCF", get("minFreeCashFlow"), get("maxFreeCashFlow"), "B");
  addFilter("Net Debt", get("minNetDebt"), get("maxNetDebt"), "B");

  const country = get("country");
  if (country) descriptions.push(`Country: ${formatCountry(country)}`);
  const sector = get("sector");
  if (sector) descriptions.push(`Sector: ${sector}`);
  const industry = get("industry");
  if (industry) descriptions.push(`Industry: ${industry}`);

  return descriptions;
}
