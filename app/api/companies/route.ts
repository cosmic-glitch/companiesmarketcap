import { NextRequest, NextResponse } from "next/server";
import { getCompanies, getLastUpdated } from "@/lib/db";
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
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 100;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0;

    // Get companies from JSON data
    const { companies, total } = await getCompanies({
      search,
      sortBy,
      sortOrder,
      minMarketCap,
      maxMarketCap,
      limit,
      offset,
    });

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
