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

const normalizeToken = (token: string): string =>
  token.replace(/[.,&/]/g, "").toLowerCase();

export function cleanCompanyName(raw: string | null | undefined): string {
  if (!raw) return raw ?? "";
  const original = raw.trim().replace(/\s+/g, " ");
  if (!original) return original;

  const tokens = original.split(" ");

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
      tokens.pop();
      continue;
    }
    break;
  }

  let out = tokens.join(" ").replace(/[\s,&]+$/g, "").trim();

  // Drop a leading "The" only for the classic "The <brand> Company" pattern, so
  // names where the article is part of the brand keep it ("The Trade Desk",
  // "The Home Depot" — neither ends in "Company").
  if (/^the\s+.+\bcompan(?:y|ies)\.?$/i.test(original)) {
    out = out.replace(/^the\s+/i, "").trim();
  }

  // Never return an empty string — fall back to the official name if the rules
  // would have stripped everything.
  return out || original;
}
