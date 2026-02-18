import { NextRequest, NextResponse } from "next/server";
import { getCompaniesBySymbols, getLastUpdated } from "@/lib/db";
import { Company } from "@/lib/types";

export const revalidate = 3600;

const VALID_FIELDS = new Set<keyof Company>([
  "symbol",
  "name",
  "rank",
  "marketCap",
  "price",
  "week52High",
  "pctTo52WeekHigh",
  "dailyChangePercent",
  "earnings",
  "revenue",
  "peRatio",
  "ttmEPS",
  "forwardPE",
  "forwardEPS",
  "forwardEPSDate",
  "dividendPercent",
  "operatingMargin",
  "revenueGrowth5Y",
  "revenueGrowth3Y",
  "epsGrowth5Y",
  "epsGrowth3Y",
  "country",
  "lastUpdated",
]);

const MAX_SYMBOLS = 100;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const symbolsParam = searchParams.get("symbols");
    if (!symbolsParam || symbolsParam.trim() === "") {
      return NextResponse.json(
        { error: "Missing required parameter: symbols" },
        { status: 400 }
      );
    }

    const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (symbols.length === 0) {
      return NextResponse.json(
        { error: "Missing required parameter: symbols" },
        { status: 400 }
      );
    }
    if (symbols.length > MAX_SYMBOLS) {
      return NextResponse.json(
        { error: `Too many symbols: max ${MAX_SYMBOLS}, got ${symbols.length}` },
        { status: 400 }
      );
    }

    // Validate fields param if provided
    const fieldsParam = searchParams.get("fields");
    let selectedFields: (keyof Company)[] | null = null;
    if (fieldsParam) {
      const fields = fieldsParam.split(",").map((f) => f.trim()).filter(Boolean);
      const invalid = fields.filter((f) => !VALID_FIELDS.has(f as keyof Company));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Invalid fields: ${invalid.join(", ")}` },
          { status: 400 }
        );
      }
      selectedFields = fields as (keyof Company)[];
    }

    const companiesMap = await getCompaniesBySymbols(symbols);
    const lastUpdated = await getLastUpdated();

    // Build response keyed by symbol
    const companies: Record<string, Partial<Company>> = {};
    for (const [symbol, company] of companiesMap) {
      if (selectedFields) {
        const picked: Partial<Company> = {};
        for (const field of selectedFields) {
          (picked as any)[field] = company[field];
        }
        companies[symbol] = picked;
      } else {
        companies[symbol] = company;
      }
    }

    return NextResponse.json({
      companies,
      lastUpdated: lastUpdated || undefined,
    });
  } catch (error: any) {
    console.error("Error fetching companies by symbol:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies", message: error.message },
      { status: 500 }
    );
  }
}
