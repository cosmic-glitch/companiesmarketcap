import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes, getOriginalSymbol } from "@/lib/yahoo-finance";
import { PriceQuote } from "@/lib/types";

export const revalidate = 60; // Cache for 1 minute (quotes are time-sensitive)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get("symbols");

    if (!symbolsParam) {
      return NextResponse.json(
        { error: "Missing symbols parameter" },
        { status: 400 }
      );
    }

    const symbols = symbolsParam.split(",").filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    // Limit to prevent abuse (100 symbols matches our page size)
    if (symbols.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 symbols allowed per request" },
        { status: 400 }
      );
    }

    // Fetch quotes from Yahoo Finance
    const results = await fetchQuotes(symbols);

    // Build response map
    const quotes: Record<string, PriceQuote> = {};
    for (const quote of results) {
      if (!quote.symbol) continue;

      // Map back to original symbol (in case it was remapped)
      const originalSymbol = getOriginalSymbol(quote.symbol);

      quotes[originalSymbol] = {
        price: quote.regularMarketPrice ?? null,
        changePercent: quote.regularMarketChangePercent ?? null,
      };
    }

    return NextResponse.json({ quotes });
  } catch (error: any) {
    console.error("Error fetching quotes:", error);
    return NextResponse.json(
      { error: "Failed to fetch quotes", message: error.message },
      { status: 500 }
    );
  }
}
