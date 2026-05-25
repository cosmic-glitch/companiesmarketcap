// Stable issue codes; do not rename — UI filters, logs, and dump tools key off them.
export const DATA_QUALITY_ISSUE_CODES = [
  "ttm_annual_rev_divergence",
  "earnings_exceeds_mcap",
  "ttm_eps_exceeds_price",
  "fcf_exceeds_mcap",
] as const;

export type DataQualityIssueCode = (typeof DATA_QUALITY_ISSUE_CODES)[number];

// Human-readable explanation of each check, surfaced to users in the
// "hidden entries" transparency modal.
export const DATA_QUALITY_ISSUE_LABELS: Record<DataQualityIssueCode, string> = {
  ttm_annual_rev_divergence: "TTM revenue diverges by more than 10× from the latest annual revenue",
  earnings_exceeds_mcap: "TTM earnings exceed 3× the market cap",
  ttm_eps_exceeds_price: "TTM EPS exceeds the share price",
  fcf_exceeds_mcap: "Free cash flow exceeds 5× the market cap",
};

// Shape we read from. Subset of DatabaseCompany — kept narrow so this module
// stays a pure data-quality concern and can run anywhere (scraper, read path,
// dump scripts) without dragging in other types.
export interface DataQualityInput {
  market_cap: number | null;
  price: number | null;
  earnings: number | null;
  revenue: number | null;
  ttm_eps: number | null;
  free_cash_flow: number | null;
  revenue_annual: { year: number; revenue: number }[] | null;
}

// Detect data corruption / non-comparable security mixups in a scraped row.
// Designed to run at scrape time (canonical) and at read time (fallback for
// rows written before this field existed).
export function detectDataQualityIssues(row: DataQualityInput): DataQualityIssueCode[] {
  const issues: DataQualityIssueCode[] = [];
  const mc = row.market_cap;
  if (mc === null || mc <= 0) return issues;

  // 1. TTM revenue diverges from latest annual revenue by more than 10×.
  // Implies a quarterly-statement currency mismatch (BMA-style ARS+USD rollup),
  // a non-USD-converted aggregation (FMX-style), or a single corrupt quarter
  // at the source (COHR-style). Threshold leaves headroom for hyper-growth
  // companies; 10× is well past anything organic.
  const latestAnnualRev = row.revenue_annual?.[0]?.revenue ?? null;
  if (
    row.revenue !== null &&
    latestAnnualRev !== null &&
    latestAnnualRev > 0 &&
    (row.revenue / latestAnnualRev > 10 || row.revenue / latestAnnualRev < 0.1)
  ) {
    issues.push("ttm_annual_rev_divergence");
  }

  // 2. |earnings| > 3 × market cap (PE < 0.33). Backstop for rows that have
  // no annual data to compare against. 3× lets genuine outliers like
  // Fannie/Freddie (~1.5× during recoveries) through.
  if (row.earnings !== null && Math.abs(row.earnings) > mc * 3) {
    issues.push("earnings_exceeds_mcap");
  }

  // 3. |ttmEPS| > price (PE < 1). Same impossibility at the per-share level.
  // Catches structural mismatches where a preferred / depositary share row
  // inherits the parent common's EPS but trades at par (FCNCN, UZE, UZD).
  if (
    row.ttm_eps !== null &&
    row.price !== null &&
    row.price > 0 &&
    Math.abs(row.ttm_eps) > row.price
  ) {
    issues.push("ttm_eps_exceeds_price");
  }

  // 4. |FCF| > 5 × market cap. FCF comes from a separate FMP endpoint with
  // its own reportedCurrency and can be broken even when income statements
  // look fine. 5× is loose enough not to trip aggressive cash returners.
  if (row.free_cash_flow !== null && Math.abs(row.free_cash_flow) > mc * 5) {
    issues.push("fcf_exceeds_mcap");
  }

  return issues;
}
