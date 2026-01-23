import CompaniesTable from "@/components/CompaniesTable";
import Pagination from "@/components/Pagination";
import { getCompanies, getLastUpdated } from "@/lib/db";
import { Company, CompaniesQueryParams } from "@/lib/types";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

interface SearchParams {
  page?: string;
  sortBy?: string;
  sortOrder?: string;
  minMarketCap?: string;
  maxMarketCap?: string;
  minEarnings?: string;
  maxEarnings?: string;
  minPERatio?: string;
  maxPERatio?: string;
  minDividend?: string;
  maxDividend?: string;
  minOperatingMargin?: string;
  maxOperatingMargin?: string;
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

  const queryParams: CompaniesQueryParams = {
    sortBy,
    sortOrder,
    minMarketCap: parseNumber(params.minMarketCap),
    maxMarketCap: parseNumber(params.maxMarketCap),
    minEarnings: parseNumber(params.minEarnings),
    maxEarnings: parseNumber(params.maxEarnings),
    minPERatio: parseNumber(params.minPERatio),
    maxPERatio: parseNumber(params.maxPERatio),
    minDividend: parseNumber(params.minDividend),
    maxDividend: parseNumber(params.maxDividend),
    minOperatingMargin: parseNumber(params.minOperatingMargin),
    maxOperatingMargin: parseNumber(params.maxOperatingMargin),
    search: params.search,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const { companies, total } = getCompanies(queryParams);
  const lastUpdated = getLastUpdated();

  return (
    <main className="min-h-screen bg-white">
      {/* Clean Header */}
      <div className="border-b border-slate-200 bg-white py-6 px-4 md:px-8">
        <div className="max-w-[1600px] mx-auto">
          <h1 className="text-2xl font-semibold text-slate-900">
            Largest US Companies by Market Cap
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {total.toLocaleString()} companies ranked by market capitalization
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
        <CompaniesTable
          companies={companies}
          lastUpdated={lastUpdated || undefined}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />

        <Pagination
          currentPage={page}
          totalItems={total}
          perPage={PER_PAGE}
        />

        <footer className="mt-8 mb-6 text-center text-xs text-slate-400">
          <p>Data sourced from companiesmarketcap.com</p>
        </footer>
      </div>
    </main>
  );
}
