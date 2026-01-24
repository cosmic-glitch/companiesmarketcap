import YahooFinance from "yahoo-finance2";

// Create Yahoo Finance instance
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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
}

export async function fetchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  if (symbols.length === 0) return [];

  const mappedSymbols = symbols.map(mapSymbol);

  try {
    const results = await yf.quote(mappedSymbols, {
      fields: ["regularMarketPrice", "regularMarketChangePercent"],
    });

    // Handle both single result and array of results
    const resultsArray = Array.isArray(results) ? results : [results];
    return resultsArray as QuoteResult[];
  } catch (error) {
    console.error("Error fetching quotes from Yahoo Finance:", error);
    return [];
  }
}
