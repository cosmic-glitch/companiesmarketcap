import YahooFinance from "yahoo-finance2";

// Create Yahoo Finance instance
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const QUOTE_TIMEOUT_MS = 8_000;

// Symbol mapping for known mismatches between our data and Yahoo Finance
const SYMBOL_MAP: Record<string, string> = {
  MMC: "MRSH", // Marsh McLennan
  FI: "FISV", // Fiserv
  // Add more as discovered
};

// Reverse mapping to get original symbol from Yahoo symbol
const REVERSE_SYMBOL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k])
);

export function mapSymbol(symbol: string): string {
  return SYMBOL_MAP[symbol] || symbol;
}

export function getOriginalSymbol(yahooSymbol: string): string {
  return REVERSE_SYMBOL_MAP[yahooSymbol] || yahooSymbol;
}

export interface QuoteResult {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
}

// Yahoo throttles large single requests from shared datacenter IPs, so the
// full ~2,600-symbol universe goes out in chunks. Each chunk fails
// independently: one throttled/timed-out response drops only its own symbols
// instead of blanking every live quote on the page.
const QUOTE_BATCH_SIZE = 250;

async function fetchQuoteBatch(symbols: string[]): Promise<QuoteResult[]> {
  const results = await yf.quote(symbols, {
    fields: ["regularMarketPrice", "regularMarketChangePercent", "marketCap", "fiftyTwoWeekHigh"],
  }, {
    fetchOptions: { signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) },
  });

  // Handle both single result and array of results
  return (Array.isArray(results) ? results : [results]) as QuoteResult[];
}

export async function fetchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  if (symbols.length === 0) return [];

  const mappedSymbols = symbols.map(mapSymbol);
  const batches: string[][] = [];
  for (let i = 0; i < mappedSymbols.length; i += QUOTE_BATCH_SIZE) {
    batches.push(mappedSymbols.slice(i, i + QUOTE_BATCH_SIZE));
  }

  const settled = await Promise.allSettled(batches.map(fetchQuoteBatch));

  const results: QuoteResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      console.error("Error fetching quotes from Yahoo Finance:", outcome.reason);
    }
  }
  return results;
}
