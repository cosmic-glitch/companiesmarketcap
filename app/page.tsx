import CompaniesTable from "@/components/CompaniesTable";
import Pagination from "@/components/Pagination";
import { getAllSymbols, getCompanies, getLastUpdated } from "@/lib/db";
import { getAllQuotes } from "@/lib/quotes";
import { Company, CompaniesQueryParams } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";

export const revalidate = 3600; // Revalidate every hour (data updates daily via scraper)

const PER_PAGE = 100;

function getSubtitleText(sortBy: keyof Company, total: number, params: SearchParams): string {
  const sortLabels: Record<string, string> = {
    rank: "market capitalization",
    marketCap: "market capitalization",
    name: "name",
    price: "price",
    dailyChangePercent: "daily change",
    pctTo52WeekHigh: "% to 52W High",
    earnings: "earnings",
    revenue: "revenue",
    peRatio: "P/E ratio",
    forwardPE: "Fwd PE",
    dividendPercent: "Div Yield",
    operatingMargin: "Op Margin",
    revenueGrowth5Y: "Rev Growth 5Y",
    revenueGrowth3Y: "Rev Growth 3Y",
    epsGrowth5Y: "EPS Growth 5Y",
    epsGrowth3Y: "EPS Growth 3Y",
  };

  const filterDescriptions: string[] = [];

  // Helper for range formatting
  const addFilter = (label: string, min: string | undefined, max: string | undefined, suffix = '') => {
    if (min && max) {
      filterDescriptions.push(`${min}${suffix} < ${label} < ${max}${suffix}`);
    } else if (min) {
      filterDescriptions.push(`${label} > ${min}${suffix}`);
    } else if (max) {
      filterDescriptions.push(`${label} < ${max}${suffix}`);
    }
  };

  // Market Cap (special formatting for $B/$T)
  const formatMktCap = (val: string) => {
    const num = parseFloat(val);
    return num >= 1000 ? `$${num / 1000}T` : `$${num}B`;
  };
  if (params.minMarketCap && params.maxMarketCap) {
    filterDescriptions.push(`${formatMktCap(params.minMarketCap)} < Mkt Cap < ${formatMktCap(params.maxMarketCap)}`);
  } else if (params.minMarketCap) {
    filterDescriptions.push(`Mkt Cap > ${formatMktCap(params.minMarketCap)}`);
  } else if (params.maxMarketCap) {
    filterDescriptions.push(`Mkt Cap < ${formatMktCap(params.maxMarketCap)}`);
  }

  // Forward PE
  addFilter('Fwd PE', params.minForwardPE, params.maxForwardPE);

  // P/E Ratio
  addFilter('P/E', params.minPERatio, params.maxPERatio);

  // Dividend Yield
  addFilter('Div Yield', params.minDividend, params.maxDividend, '%');

  // Operating Margin
  addFilter('Op Margin', params.minOperatingMargin, params.maxOperatingMargin, '%');

  // Revenue Growth 5Y
  addFilter('Rev Growth 5Y', params.minRevenueGrowth, params.maxRevenueGrowth, '%');

  // Revenue Growth 3Y
  addFilter('Rev Growth 3Y', params.minRevenueGrowth3Y, params.maxRevenueGrowth3Y, '%');

  // EPS Growth 5Y
  addFilter('EPS Growth 5Y', params.minEPSGrowth, params.maxEPSGrowth, '%');

  // EPS Growth 3Y
  addFilter('EPS Growth 3Y', params.minEPSGrowth3Y, params.maxEPSGrowth3Y, '%');

  // % to 52W High
  addFilter('% to 52W High', params.minPctTo52WeekHigh, params.maxPctTo52WeekHigh, '%');

  // Earnings
  addFilter('Earnings', params.minEarnings, params.maxEarnings, 'B');

  // Revenue
  addFilter('Revenue', params.minRevenue, params.maxRevenue, 'B');

  const countText = total.toLocaleString();
  const sortLabel = sortLabels[sortBy] || "market capitalization";

  if (filterDescriptions.length > 0) {
    const criteria = filterDescriptions.join(', ');
    return `${countText} companies with ${criteria}; ordered by ${sortLabel}`;
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
  minRevenueGrowth3Y?: string;
  maxRevenueGrowth3Y?: string;
  minEPSGrowth?: string;
  maxEPSGrowth?: string;
  minEPSGrowth3Y?: string;
  maxEPSGrowth3Y?: string;
  minPctTo52WeekHigh?: string;
  maxPctTo52WeekHigh?: string;
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
  const sortBy = (params.sortBy as keyof Company) || "marketCap";
  const sortOrder = (params.sortOrder === "asc" ? "asc" : "desc") as "asc" | "desc";

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
    minRevenueGrowth3Y: parseGrowthPercent(params.minRevenueGrowth3Y),
    maxRevenueGrowth3Y: parseGrowthPercent(params.maxRevenueGrowth3Y),
    minEPSGrowth: parseGrowthPercent(params.minEPSGrowth),
    maxEPSGrowth: parseGrowthPercent(params.maxEPSGrowth),
    minEPSGrowth3Y: parseGrowthPercent(params.minEPSGrowth3Y),
    maxEPSGrowth3Y: parseGrowthPercent(params.maxEPSGrowth3Y),
    minPctTo52WeekHigh: parseNumber(params.minPctTo52WeekHigh),
    maxPctTo52WeekHigh: parseNumber(params.maxPctTo52WeekHigh),
    search: params.search,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  // Fetch live quotes server-side once, then use them for filtering/sorting/display consistently
  const symbols = await getAllSymbols();
  const { quotes } = await getAllQuotes(symbols);
  const { companies, total } = await getCompanies(queryParams, quotes);

  // Fetch last updated timestamp
  const lastUpdated = await getLastUpdated();

  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="relative border-b border-border-subtle bg-bg-secondary py-4 px-0 overflow-hidden">
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
                {getSubtitleText(sortBy, total, params)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-0 pt-3 pb-6">
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

        {lastUpdated && (
          <p className="text-center text-text-secondary text-sm mt-6">
            Data last refreshed: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </div>
    </main>
  );
}
