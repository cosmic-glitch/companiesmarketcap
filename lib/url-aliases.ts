// URL alias translation layer.
//
// The app stores filters/sort/columns internally with verbose, descriptive
// names (`minMarketCap`, `maxForwardPE`, `marketCap`, …). The URL bar uses
// short aliases (`mc.min`, `fpe.max`, `mc`, …) so links are readable and
// hand-editable. Reads accept either form (back-compat for older shared
// links); writes always emit the alias.

// Top-level URL params: filters, scalar selects, sort keys.
const PARAM_TO_ALIAS: Record<string, string> = {
  minMarketCap: "mc.min", maxMarketCap: "mc.max",
  minEarnings: "earn.min", maxEarnings: "earn.max",
  minRevenue: "rev.min", maxRevenue: "rev.max",
  minFreeCashFlow: "fcf.min", maxFreeCashFlow: "fcf.max",
  minNetDebt: "nd.min", maxNetDebt: "nd.max",
  minPERatio: "pe.min", maxPERatio: "pe.max",
  minForwardPE: "fpe.min", maxForwardPE: "fpe.max",
  minForwardEPSGrowth: "fepg.min", maxForwardEPSGrowth: "fepg.max",
  minDividend: "div.min", maxDividend: "div.max",
  minOperatingMargin: "opm.min", maxOperatingMargin: "opm.max",
  minRevenueGrowth: "rg5.min", maxRevenueGrowth: "rg5.max",
  minRevenueGrowth3Y: "rg3.min", maxRevenueGrowth3Y: "rg3.max",
  minEPSGrowth: "eg5.min", maxEPSGrowth: "eg5.max",
  minEPSGrowth3Y: "eg3.min", maxEPSGrowth3Y: "eg3.max",
  minPctTo52WeekHigh: "52h.min", maxPctTo52WeekHigh: "52h.max",
  country: "ctry",
  sector: "sec",
  industry: "ind",
  sortBy: "sb",
  sortOrder: "so",
};

const ALIAS_TO_PARAM: Record<string, string> = Object.fromEntries(
  Object.entries(PARAM_TO_ALIAS).map(([k, v]) => [v, k])
);

// Column-key aliases — used inside `cols=…` and as the value of `sb=…`.
// Keys not listed here (e.g. `rank`, `name`) are short enough to use verbatim.
const COL_TO_ALIAS: Record<string, string> = {
  country: "ctry",
  sector: "sec",
  industry: "ind",
  marketCap: "mc",
  price: "p",
  dailyChangePercent: "chg",
  pctTo52WeekHigh: "52h",
  earnings: "earn",
  revenue: "rev",
  freeCashFlow: "fcf",
  netDebt: "nd",
  peRatio: "pe",
  forwardPE: "fpe",
  forwardEPSGrowth: "fepg",
  dividendPercent: "div",
  operatingMargin: "opm",
  revenueGrowth5Y: "rg5",
  revenueGrowth3Y: "rg3",
  epsGrowth5Y: "eg5",
  epsGrowth3Y: "eg3",
  revenueAnnual: "rev10y",
  epsAnnual: "eps10y",
};

const ALIAS_TO_COL: Record<string, string> = Object.fromEntries(
  Object.entries(COL_TO_ALIAS).map(([k, v]) => [v, k])
);

export function toUrlAlias(internalKey: string): string {
  return PARAM_TO_ALIAS[internalKey] ?? internalKey;
}

export function fromUrlAlias(alias: string): string {
  return ALIAS_TO_PARAM[alias] ?? alias;
}

export function colKeyToAlias(internalKey: string): string {
  return COL_TO_ALIAS[internalKey] ?? internalKey;
}

export function colKeyFromAlias(alias: string): string {
  return ALIAS_TO_COL[alias] ?? alias;
}

// Read-only param surface that both URLSearchParams and Next's
// ReadonlyURLSearchParams satisfy, so callers don't need to pick.
type ParamReader = { has(key: string): boolean; get(key: string): string | null };

// Read a value preferring the alias form, falling back to long-form for
// back-compat with previously-shared links.
export function readAliased(sp: ParamReader | null | undefined, internalKey: string): string | null {
  if (!sp) return null;
  const alias = PARAM_TO_ALIAS[internalKey];
  if (alias) {
    const v = sp.get(alias);
    if (v !== null) return v;
  }
  return sp.get(internalKey);
}

export function hasAliased(sp: ParamReader | null | undefined, internalKey: string): boolean {
  if (!sp) return false;
  const alias = PARAM_TO_ALIAS[internalKey];
  if (alias && sp.has(alias)) return true;
  return sp.has(internalKey);
}

// Same logic as readAliased, but for plain Record<string, string|undefined>
// (e.g. Next.js server-component searchParams).
export function readParam(
  params: Record<string, string | undefined> | null | undefined,
  internalKey: string
): string | undefined {
  if (!params) return undefined;
  const alias = PARAM_TO_ALIAS[internalKey];
  if (alias) {
    const v = params[alias];
    if (v !== undefined) return v;
  }
  return params[internalKey];
}

// Build a new URLSearchParams by carrying over existing entries, then for
// each updated key: drop both the alias and the long-form, set the alias.
// Empty/undefined values delete instead of writing. The `sortBy` value is
// translated through colKeyToAlias so `sb=mc` rather than `sb=marketCap`.
export function applyUpdates(
  sp: { toString(): string } | null | undefined,
  updates: Record<string, string | undefined>
): URLSearchParams {
  const result = new URLSearchParams(sp?.toString() ?? "");
  for (const [internalKey, value] of Object.entries(updates)) {
    const alias = toUrlAlias(internalKey);
    result.delete(alias);
    if (alias !== internalKey) result.delete(internalKey);
    if (value === undefined || value === "") continue;
    const out = internalKey === "sortBy" ? colKeyToAlias(value) : value;
    result.set(alias, out);
  }
  return result;
}

// Encode a visible-column set for the URL. Returns null when it matches the
// defaults, so the URL stays clean for users who never touched columns.
export function encodeColumns(visible: Set<string>, defaults: Set<string>): string | null {
  if (visible.size === defaults.size) {
    let allMatch = true;
    for (const key of visible) {
      if (!defaults.has(key)) { allMatch = false; break; }
    }
    if (allMatch) return null;
  }
  return Array.from(visible).map(colKeyToAlias).join(",");
}

// Decode the cols= raw string back to internal column keys. Empty/missing
// input falls back to defaults. Unknown aliases pass through unchanged and
// are filtered out downstream when checked against the column registry.
export function decodeColumns(raw: string | null | undefined, defaults: Set<string>): Set<string> {
  if (!raw) return new Set(defaults);
  const result = new Set<string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    result.add(colKeyFromAlias(trimmed));
  }
  return result;
}
