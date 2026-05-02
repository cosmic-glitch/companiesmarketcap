import { NextRequest, NextResponse } from "next/server";
import { getAllSymbols, getCompanies, getLastUpdated } from "@/lib/db";
import { getAllQuotes } from "@/lib/quotes";
import { CompaniesResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const search = searchParams.get("search") || undefined;
    const sortBy = (searchParams.get("sortBy") as any) || "rank";
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "asc";
    const minMarketCap = searchParams.get("minMarketCap")
      ? parseFloat(searchParams.get("minMarketCap")!)
      : undefined;
    const maxMarketCap = searchParams.get("maxMarketCap")
      ? parseFloat(searchParams.get("maxMarketCap")!)
      : undefined;
    const parseGrowthPercent = (key: string) => {
      const value = searchParams.get(key);
      if (!value) return undefined;
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num / 100;
    };
    const minForwardEPSGrowth = parseGrowthPercent("minForwardEPSGrowth");
    const maxForwardEPSGrowth = parseGrowthPercent("maxForwardEPSGrowth");
    const country = searchParams.get("country") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 100;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0;

    const symbols = await getAllSymbols();
    const { quotes } = await getAllQuotes(symbols);

    // Get companies from JSON data with live quote fields applied
    const { companies, total } = await getCompanies({
      search,
      sortBy,
      sortOrder,
      minMarketCap,
      maxMarketCap,
      minForwardEPSGrowth,
      maxForwardEPSGrowth,
      country,
      limit,
      offset,
    }, quotes);

    // Get last updated timestamp
    const lastUpdated = await getLastUpdated();

    // Calculate pagination
    const page = Math.floor(offset / limit) + 1;
    const perPage = limit;

    const response: CompaniesResponse = {
      companies,
      total,
      page,
      perPage,
      lastUpdated: lastUpdated || undefined,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies", message: error.message },
      { status: 500 }
    );
  }
}
