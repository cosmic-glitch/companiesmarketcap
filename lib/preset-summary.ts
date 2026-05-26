import { formatCountry } from "./countries";

// Generates the criteria subtitle shown under a preset's label, e.g.
// "Mkt Cap $1T+, Fwd PE < 25". Format is intentionally tight: the same
// string is rendered for both hardcoded defaults and user-saved presets,
// so any change here applies uniformly.

type ValueFormat = "money" | "percent" | "number";

interface FilterDef {
  label: string;
  format: ValueFormat;
}

// Keys are the suffix shared by min/max URL params (e.g. "MarketCap" →
// minMarketCap/maxMarketCap). Iteration order is the render order.
const FILTER_DEFS: ReadonlyArray<readonly [string, FilterDef]> = [
  ["MarketCap", { label: "Mkt Cap", format: "money" }],
  ["Earnings", { label: "Earnings", format: "money" }],
  ["Revenue", { label: "Revenue", format: "money" }],
  ["FreeCashFlow", { label: "FCF", format: "money" }],
  ["NetDebt", { label: "Net Debt", format: "money" }],
  ["PERatio", { label: "P/E", format: "number" }],
  ["ForwardPE", { label: "Fwd PE", format: "number" }],
  ["ForwardEPSGrowth", { label: "Fwd EPS Growth", format: "percent" }],
  ["Dividend", { label: "Yield", format: "percent" }],
  ["OperatingMargin", { label: "Op Margin", format: "percent" }],
  ["RevenueGrowth", { label: "Rev Growth", format: "percent" }],
  ["RevenueGrowth3Y", { label: "Rev Growth 3Y", format: "percent" }],
  ["EPSGrowth", { label: "EPS Growth", format: "percent" }],
  ["EPSGrowth3Y", { label: "EPS Growth 3Y", format: "percent" }],
  ["PctTo52WeekHigh", { label: "% to 52W High", format: "percent" }],
];

function formatValue(format: ValueFormat, raw: string): string {
  if (format === "money") {
    const n = parseFloat(raw);
    if (!isFinite(n)) return raw;
    return n >= 1000 ? `$${n / 1000}T` : `$${n}B`;
  }
  if (format === "percent") {
    return `${raw}%`;
  }
  return raw;
}

function formatBound(def: FilterDef, min: string | undefined, max: string | undefined): string | null {
  if (!min && !max) return null;
  const minStr = min ? formatValue(def.format, min) : null;
  const maxStr = max ? formatValue(def.format, max) : null;
  if (minStr && maxStr) return `${def.label} ${minStr}–${maxStr}`;
  if (minStr) return `${def.label} ${minStr}+`;
  return `${def.label} < ${maxStr}`;
}

// Renders the display name for a preset. Community presets prefix the label
// with the author's initials (e.g. "AV: Big & Cheap"); legacy entries
// without initials and the hardcoded curated presets render the label alone.
export function formatPresetName(preset: { label: string; initials?: string }): string {
  const initials = preset.initials?.trim();
  return initials ? `${initials}: ${preset.label}` : preset.label;
}

// Friendly labels for the sortable Company fields a preset can target. Kept in
// sync with COLUMN_OPTIONS in CompaniesTable; unknown keys fall back to the raw
// field name so a new sort target degrades gracefully rather than breaking.
const SORT_FIELD_LABELS: Record<string, string> = {
  marketCap: "Market Cap",
  price: "Price",
  dailyChangePercent: "Today",
  pctTo52WeekHigh: "% to 52W High",
  earnings: "Earnings",
  revenue: "Revenue",
  freeCashFlow: "FCF",
  peRatio: "P/E",
  forwardPE: "Fwd P/E",
  forwardEPSGrowth: "Fwd EPS Growth",
  dividendPercent: "Div %",
  operatingMargin: "Op. Margin %",
  netDebt: "Net Debt",
  revenueGrowth5Y: "Rev CAGR 5Y",
  revenueGrowth3Y: "Rev CAGR 3Y",
  epsGrowth5Y: "EPS CAGR 5Y",
  epsGrowth3Y: "EPS CAGR 3Y",
  rank: "Rank",
};

// Describes a preset's sort, e.g. "Fwd P/E ↑" (ascending) or "Div % ↓"
// (descending). Returns null when the preset specifies no sort, in which case
// it inherits the default market-cap ranking and nothing is shown.
export function formatPresetSort(sort: { sortBy?: string; sortOrder?: "asc" | "desc" }): string | null {
  if (!sort?.sortBy) return null;
  const label = SORT_FIELD_LABELS[sort.sortBy] ?? sort.sortBy;
  const arrow = sort.sortOrder === "asc" ? "↑" : "↓";
  return `${label} ${arrow}`;
}

export function formatPresetCriteria(filters: Record<string, string>): string {
  const parts: string[] = [];
  for (const [key, def] of FILTER_DEFS) {
    const part = formatBound(def, filters[`min${key}`], filters[`max${key}`]);
    if (part) parts.push(part);
  }
  if (filters.country) {
    parts.push(`Country: ${formatCountry(filters.country)}`);
  }
  if (filters.sector) {
    parts.push(`Sector: ${filters.sector}`);
  }
  if (filters.industry) {
    parts.push(`Industry: ${filters.industry}`);
  }
  return parts.join(", ");
}
