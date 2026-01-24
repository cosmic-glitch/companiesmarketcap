import { fetchQuotes, getOriginalSymbol } from "./yahoo-finance";
import { PriceQuote } from "./types";

// In-memory cache for quotes
let cache: Map<string, PriceQuote> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute TTL

export interface QuotesResult {
  quotes: Map<string, PriceQuote>;
  cacheAge: number; // milliseconds since last fetch
  fromCache: boolean;
}

export async function getAllQuotes(symbols: string[]): Promise<QuotesResult> {
  const now = Date.now();

  // Return from cache if still valid
  if (cache && now - cacheTime < CACHE_TTL) {
    return {
      quotes: cache,
      cacheAge: now - cacheTime,
      fromCache: true,
    };
  }

  // Fetch fresh quotes
  const results = await fetchQuotes(symbols);

  // Build new cache
  cache = new Map();
  for (const quote of results) {
    if (!quote.symbol) continue;

    // Map back to original symbol (in case it was remapped)
    const originalSymbol = getOriginalSymbol(quote.symbol);

    cache.set(originalSymbol, {
      price: quote.regularMarketPrice ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
    });
  }

  cacheTime = now;

  return {
    quotes: cache,
    cacheAge: 0,
    fromCache: false,
  };
}

// Get cache age in minutes (for display)
export function getCacheAgeMinutes(): number {
  if (!cacheTime) return 0;
  return Math.floor((Date.now() - cacheTime) / 60_000);
}
