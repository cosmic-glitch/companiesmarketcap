// Shorten an official company name into a cleaner display label by peeling off
// legal/organizational boilerplate suffixes — e.g.
//   "NVIDIA Corporation"                              → "NVIDIA"
//   "Apple Inc."                                      → "Apple"
//   "Meta Platforms, Inc."                            → "Meta Platforms"
//   "Eli Lilly and Company"                           → "Eli Lilly"
//   "JPMorgan Chase & Co."                            → "JPMorgan Chase"
//   "The Walt Disney Company"                         → "Walt Disney"
//   "Taiwan Semiconductor Manufacturing Company Ltd"  → "Taiwan Semiconductor Manufacturing"
//
// This is intentionally DISPLAY-ONLY: the canonical `name` stays the official
// FMP value so search (lib/db.ts) and sort keep matching the full legal name —
// shortening it here would make "apple inc" stop finding Apple. High precision
// over recall: only unambiguous entity boilerplate is stripped, never
// distinctive brand words ("Technologies", "Platforms", "Enterprises", …), so
// the worst case is "didn't shorten" rather than "mangled the name".

// Curated display-name overrides, keyed by ticker symbol. These are dominant,
// widely-recognized common names that the suffix-peeler below can't produce
// because they aren't substrings of the legal name — acronyms ("International
// Business Machines" → "IBM"), brand contractions ("Space Exploration
// Technologies" → "SpaceX"), domain-tail drops ("Amazon.com" → "Amazon"), and
// brand casing ("NIKE" → "Nike"). Keep this list small and high-precision: only
// add a company when the override is unambiguously the name people use. Checked
// before any stripping; a match returns verbatim. DISPLAY-ONLY — the canonical
// `name` is untouched, so search/sort/tooltip keep matching the legal name.
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  // Acronyms / initialisms
  IBM: "IBM", // International Business Machines Corporation
  AMD: "AMD", // Advanced Micro Devices, Inc.
  TSM: "TSMC", // Taiwan Semiconductor Manufacturing Company Limited
  UMC: "UMC", // United Microelectronics Corporation
  AIG: "AIG", // American International Group, Inc.
  // Brand contractions / dominant short names
  AMZN: "Amazon", // Amazon.com, Inc.
  SPCX: "SpaceX", // Space Exploration Technologies Corp.
  META: "Meta", // Meta Platforms, Inc.
  WAB: "Wabtec", // Westinghouse Air Brake Technologies Corporation
  WLY: "Wiley", // John Wiley & Sons, Inc.
  PHG: "Philips", // Koninklijke Philips N.V.
  ERIC: "Ericsson", // Telefonaktiebolaget LM Ericsson (publ)
  GT: "Goodyear", // The Goodyear Tire & Rubber Company
  JBLU: "JetBlue", // JetBlue Airways Corporation
  PTON: "Peloton", // Peloton Interactive, Inc.
  HLF: "Herbalife", // Herbalife Nutrition Ltd.
  // Domain-tail drops
  WIX: "Wix", // Wix.com Ltd.
  TBLA: "Taboola", // Taboola.com Ltd.
  LZ: "LegalZoom", // LegalZoom.com, Inc.
  // Brand casing (FMP stores these all-caps)
  NKE: "Nike", // NIKE, Inc.
  QCOM: "Qualcomm", // QUALCOMM Incorporated
  GFS: "GlobalFoundries", // GLOBALFOUNDRIES Inc.
};

// Trailing tokens we treat as droppable boilerplate. Compared after stripping
// punctuation and lowercasing, so "Inc." / "Inc" / "S.A." / "PLC" all match.
const DROPPABLE_SUFFIX_TOKENS = new Set([
  // English corporate forms
  "inc", "incorporated", "corp", "corporation", "co", "company", "companies",
  "ltd", "limited", "llc", "llp", "lp", "plc", "holdings", "holding", "group",
  // International corporate forms
  "ag", "sa", "sab", "nv", "se", "ab", "asa", "oyj", "spa", "bhd", "berhad",
  "pte", "kgaa", "as", "adr",
  // Connector left dangling once the entity word after it is removed
  // (e.g. "Eli Lilly and Company" → drop "Company" → drop "and").
  "and",
]);

// A subset of the suffixes above that denote a *collective* entity ("…Group",
// "…Corporation", "…Companies"). When one of these is peeled off the end, a
// leading "The" is left stranded and reads wrong ("The Goldman Sachs Group" →
// "The Goldman Sachs"), so we drop it. A bare "Inc." is NOT collective, so
// brands where the article is intrinsic survive ("The Home Depot, Inc." stays
// "The Home Depot"; "The Trade Desk").
const COLLECTIVE_ENTITY_TOKENS = new Set([
  "group", "corporation", "corp", "companies", "company", "co", "holdings",
  "holding",
]);

const normalizeToken = (token: string): string =>
  token.replace(/[.,&/]/g, "").toLowerCase();

export function cleanCompanyName(
  raw: string | null | undefined,
  symbol?: string | null,
): string {
  // Curated overrides win outright and skip the peeler entirely.
  if (symbol && DISPLAY_NAME_OVERRIDES[symbol]) {
    return DISPLAY_NAME_OVERRIDES[symbol];
  }

  if (!raw) return raw ?? "";
  const original = raw.trim().replace(/\s+/g, " ");
  if (!original) return original;

  const tokens = original.split(" ");
  const peeled: string[] = [];

  // Peel trailing boilerplate one token at a time so stacked suffixes like
  // "… Company Limited" or "… & Co." fully unwind. Always keep at least one
  // token, and cap iterations as a belt-and-suspenders guard.
  let guard = 0;
  while (tokens.length > 1 && guard++ < 6) {
    const last = tokens[tokens.length - 1];
    if (last === "&" || last === ",") {
      tokens.pop();
      continue;
    }
    if (DROPPABLE_SUFFIX_TOKENS.has(normalizeToken(last))) {
      peeled.push(normalizeToken(last));
      tokens.pop();
      continue;
    }
    break;
  }

  let out = tokens.join(" ").replace(/[\s,&]+$/g, "").trim();

  // Drop a stranded leading "The": once a collective entity word (Group,
  // Corporation, Companies/Company, Holdings) has been peeled off the end, a
  // leading "The" reads wrong ("The Goldman Sachs Group, Inc." → "The Goldman
  // Sachs" → "Goldman Sachs"; "The Walt Disney Company" → "Walt Disney"). When
  // only a bare suffix like "Inc." was removed, the article is part of the
  // brand and stays ("The Home Depot", "The Trade Desk").
  if (/^the\s/i.test(out) && peeled.some((t) => COLLECTIVE_ENTITY_TOKENS.has(t))) {
    out = out.replace(/^the\s+/i, "").trim();
  }

  // Never return an empty string — fall back to the official name if the rules
  // would have stripped everything.
  return out || original;
}
