import CompaniesTable from "@/components/CompaniesTable";
import Pagination from "@/components/Pagination";
import { getCompanies, getAllSymbols } from "@/lib/db";
import { getAllQuotes } from "@/lib/quotes";
import { Company, CompaniesQueryParams } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

function getSubtitleText(sortBy: keyof Company, total: number, hasFilters: boolean): string {
  const sortLabels: Record<string, string> = {
    rank: "market capitalization",
    marketCap: "market capitalization",
    name: "name",
    price: "price",
    dailyChangePercent: "daily change",
    earnings: "earnings",
    revenue: "revenue",
    peRatio: "P/E ratio",
    forwardPE: "forward P/E",
    dividendPercent: "dividend yield",
    operatingMargin: "operating margin",
    revenueGrowth5Y: "5-year revenue growth",
    epsGrowth5Y: "5-year EPS growth",
  };

  const sortLabel = sortLabels[sortBy] || "market capitalization";
  const countText = total.toLocaleString();

  if (hasFilters) {
    return `${countText} companies matching filters, ranked by ${sortLabel}`;
  }
  return `${countText} companies ranked by ${sortLabel}`;
}

interface SearchParams {
  page?: string;
  sortBy?: string;
  sortOrder?: string;
  minMarketCap?: string;
  maxMarketCap?: string;
  minEarnings?: string;
  maxEarnings?: string;
  minRevenue?: string;
  maxRevenue?: string;
  minPERatio?: string;
  maxPERatio?: string;
  minForwardPE?: string;
  maxForwardPE?: string;
  minDividend?: string;
  maxDividend?: string;
  minOperatingMargin?: string;
  maxOperatingMargin?: string;
  minRevenueGrowth?: string;
  maxRevenueGrowth?: string;
  minEPSGrowth?: string;
  maxEPSGrowth?: string;
  search?: string;
}

interface HomeProps {
  searchParams: Promise<SearchParams>;
}

export default async function Home({ searchParams }: HomeProps) {
  // In Next.js 15, searchParams is a Promise
  const params = await searchParams;

  // Parse page number
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  // Parse sort parameters
  const sortBy = (params.sortBy as keyof Company) || "rank";
  const sortOrder = (params.sortOrder === "desc" ? "desc" : "asc") as "asc" | "desc";

  // Parse filter parameters (values in billions for market cap and earnings)
  const parseNumber = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  };

  // Parse growth filters: input is percentage (e.g., 10), convert to decimal (0.10)
  const parseGrowthPercent = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num / 100;
  };

  const queryParams: CompaniesQueryParams = {
    sortBy,
    sortOrder,
    minMarketCap: parseNumber(params.minMarketCap),
    maxMarketCap: parseNumber(params.maxMarketCap),
    minEarnings: parseNumber(params.minEarnings),
    maxEarnings: parseNumber(params.maxEarnings),
    minRevenue: parseNumber(params.minRevenue),
    maxRevenue: parseNumber(params.maxRevenue),
    minPERatio: parseNumber(params.minPERatio),
    maxPERatio: parseNumber(params.maxPERatio),
    minForwardPE: parseNumber(params.minForwardPE),
    maxForwardPE: parseNumber(params.maxForwardPE),
    minDividend: parseGrowthPercent(params.minDividend),
    maxDividend: parseGrowthPercent(params.maxDividend),
    minOperatingMargin: parseGrowthPercent(params.minOperatingMargin),
    maxOperatingMargin: parseGrowthPercent(params.maxOperatingMargin),
    minRevenueGrowth: parseGrowthPercent(params.minRevenueGrowth),
    maxRevenueGrowth: parseGrowthPercent(params.maxRevenueGrowth),
    minEPSGrowth: parseGrowthPercent(params.minEPSGrowth),
    maxEPSGrowth: parseGrowthPercent(params.maxEPSGrowth),
    search: params.search,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  // Fetch live quotes from Yahoo Finance
  const allSymbols = await getAllSymbols();
  const { quotes, cacheAge, fromCache } = await getAllQuotes(allSymbols);

  // Pass quotes to getCompanies so it can merge live data and sort correctly
  const { companies, total } = await getCompanies(queryParams, quotes);

  const hasFilters = !!(
    queryParams.minMarketCap || queryParams.maxMarketCap ||
    queryParams.minEarnings || queryParams.maxEarnings ||
    queryParams.minRevenue || queryParams.maxRevenue ||
    queryParams.minPERatio || queryParams.maxPERatio ||
    queryParams.minForwardPE || queryParams.maxForwardPE ||
    queryParams.minDividend || queryParams.maxDividend ||
    queryParams.minOperatingMargin || queryParams.maxOperatingMargin ||
    queryParams.minRevenueGrowth || queryParams.maxRevenueGrowth ||
    queryParams.minEPSGrowth || queryParams.maxEPSGrowth ||
    queryParams.search
  );

  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="relative border-b border-border-subtle bg-bg-secondary py-8 px-4 md:px-8 overflow-hidden">
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />

        <div className="relative max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex-shrink-0 p-2 rounded-xl bg-bg-tertiary/50 hover:bg-bg-tertiary transition-all duration-300 hover:shadow-glow-sm group"
            >
              <Image
                src="/icon.svg"
                alt="Home"
                width={40}
                height={40}
                className="group-hover:scale-110 transition-transform duration-300"
              />
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold gradient-text">
                Largest US Companies
              </h1>
              <p className="text-base text-text-secondary mt-1">
                {getSubtitleText(sortBy, total, hasFilters)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
        <CompaniesTable
          companies={companies}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />

        <Pagination
          currentPage={page}
          totalItems={total}
          perPage={PER_PAGE}
        />

        <footer className="mt-8 mb-6 text-center space-y-1">
          <p className="text-sm text-text-muted">
            {fromCache
              ? `Prices updated ${Math.floor(cacheAge / 60000)}m ago`
              : "Prices just updated"}
          </p>
          <p className="text-sm text-text-muted">
            Data sourced from Financial Modeling Prep API
          </p>
        </footer>
      </div>
    </main>
  );
}
