import CompaniesTable from "@/components/CompaniesTable";
import Pagination from "@/components/Pagination";
import { getCompanies } from "@/lib/db";
import { Company, CompaniesQueryParams } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";

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

  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Dark Gradient Header */}
      <div className="relative border-b border-border-subtle bg-gradient-to-br from-bg-secondary via-bg-primary to-bg-secondary py-8 px-4 md:px-8 overflow-hidden">
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
                width={32}
                height={32}
                className="group-hover:scale-110 transition-transform duration-300"
              />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold gradient-text">
                  Largest US Companies
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-accent/20 text-accent rounded-full border border-accent/30">
                  Live
                </span>
              </div>
              <p className="text-sm text-text-secondary mt-1">
                <span className="text-accent font-medium">{total.toLocaleString()}</span> companies ranked by market capitalization
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

        <footer className="mt-8 mb-6 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-positive animate-pulse" />
            <span>Data sourced from companiesmarketcap.com</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
