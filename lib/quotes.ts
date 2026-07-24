import { fetchQuotes, getOriginalSymbol } from "./yahoo-finance";
import { PriceQuote } from "./types";

// In-memory cache for quotes
let cache: Map<string, PriceQuote> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute TTL for live server-side filtering/sorting/display consistency

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

  // Fetch fresh quotes (batched; failed batches are dropped, not thrown)
  const results = await fetchQuotes(symbols);

  // On a total failure, keep serving the last good quotes without resetting
  // their age — caching the failure meant every visitor saw yesterday's
  // scrape for the full TTL. The next request retries immediately.
  if (results.length === 0) {
    return {
      quotes: cache ?? new Map(),
      cacheAge: cache ? now - cacheTime : 0,
      fromCache: cache !== null,
    };
  }

  // Start from the previous cache so symbols in a failed batch keep their
  // last-known live quote (minutes old beats yesterday's close), then
  // overlay the fresh results.
  const next = new Map(cache ?? []);
  for (const quote of results) {
    if (!quote.symbol) continue;

    // Map back to original symbol (in case it was remapped)
    const originalSymbol = getOriginalSymbol(quote.symbol);

    next.set(originalSymbol, {
      price: quote.regularMarketPrice ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      marketCap: quote.marketCap ?? null,
      yearHigh: quote.fiftyTwoWeekHigh ?? null,
    });
  }

  cache = next;
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
