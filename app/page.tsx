import CompaniesTable from "@/components/CompaniesTable";
import Pagination from "@/components/Pagination";
import { getAllSymbols, getCompanies, getDistinctCountries, getDistinctIndustries, getDistinctSectors, getLastUpdated, getUserPresets } from "@/lib/db";
import { getAllQuotes } from "@/lib/quotes";
import { Company, CompaniesQueryParams } from "@/lib/types";
import { colKeyFromAlias, readParam } from "@/lib/url-aliases";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const revalidate = 60; // Quote fields are cached for 1 minute

const PER_PAGE = 100;

// Loose because both legacy long-form keys (`minMarketCap`) and new aliases
// (`mc.min`, `sb`, …) need to read from the same bag without per-key types.
type SearchParams = Record<string, string | undefined>;

// Universe size shown in the header and metadata. Rounded down to the nearest
// 100 so the marketing number stays stable as the dataset drifts day to day.
function universeCountLabel(n: number): string {
  const rounded = Math.floor(n / 100) * 100;
  return `${rounded.toLocaleString()}+`;
}

export async function generateMetadata(): Promise<Metadata> {
  const symbols = await getAllSymbols();
  const label = universeCountLabel(symbols.length);
  return {
    title: "US Stock Screener — Largest Companies by Market Cap",
    description: `Screen ${label} US-listed companies (including ADRs) over $1B market cap. Sort and filter by P/E, growth, margins, and dividend yield. No ads.`,
  };
}

interface HomeProps {
  searchParams: Promise<SearchParams>;
}

export default async function Home({ searchParams }: HomeProps) {
  // In Next.js 15, searchParams is a Promise
  const params = await searchParams;
  const get = (key: string) => readParam(params, key);

  // Parse page number
  const page = Math.max(1, parseInt(get('page') || "1", 10) || 1);

  // Parse sort parameters. URL value may be an alias (`mc`) or long-form
  // (`marketCap`); colKeyFromAlias normalizes both.
  const sortByRaw = get('sortBy');
  const sortBy = (sortByRaw ? colKeyFromAlias(sortByRaw) : "marketCap") as keyof Company;
  const sortOrder = (get('sortOrder') === "asc" ? "asc" : "desc") as "asc" | "desc";

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
    minMarketCap: parseNumber(get('minMarketCap')),
    maxMarketCap: parseNumber(get('maxMarketCap')),
    minEarnings: parseNumber(get('minEarnings')),
    maxEarnings: parseNumber(get('maxEarnings')),
    minRevenue: parseNumber(get('minRevenue')),
    maxRevenue: parseNumber(get('maxRevenue')),
    minPERatio: parseNumber(get('minPERatio')),
    maxPERatio: parseNumber(get('maxPERatio')),
    minForwardPE: parseNumber(get('minForwardPE')),
    maxForwardPE: parseNumber(get('maxForwardPE')),
    minForwardEPSGrowth: parseGrowthPercent(get('minForwardEPSGrowth')),
    maxForwardEPSGrowth: parseGrowthPercent(get('maxForwardEPSGrowth')),
    minDividend: parseGrowthPercent(get('minDividend')),
    maxDividend: parseGrowthPercent(get('maxDividend')),
    minOperatingMargin: parseGrowthPercent(get('minOperatingMargin')),
    maxOperatingMargin: parseGrowthPercent(get('maxOperatingMargin')),
    minRevenueGrowth: parseGrowthPercent(get('minRevenueGrowth')),
    maxRevenueGrowth: parseGrowthPercent(get('maxRevenueGrowth')),
    minRevenueGrowth3Y: parseGrowthPercent(get('minRevenueGrowth3Y')),
    maxRevenueGrowth3Y: parseGrowthPercent(get('maxRevenueGrowth3Y')),
    minEPSGrowth: parseGrowthPercent(get('minEPSGrowth')),
    maxEPSGrowth: parseGrowthPercent(get('maxEPSGrowth')),
    minEPSGrowth3Y: parseGrowthPercent(get('minEPSGrowth3Y')),
    maxEPSGrowth3Y: parseGrowthPercent(get('maxEPSGrowth3Y')),
    minPctTo52WeekHigh: parseNumber(get('minPctTo52WeekHigh')),
    maxPctTo52WeekHigh: parseNumber(get('maxPctTo52WeekHigh')),
    minFreeCashFlow: parseNumber(get('minFreeCashFlow')),
    maxFreeCashFlow: parseNumber(get('maxFreeCashFlow')),
    minNetDebt: parseNumber(get('minNetDebt')),
    maxNetDebt: parseNumber(get('maxNetDebt')),
    country: get('country'),
    sector: get('sector'),
    industry: get('industry'),
    search: get('search'),
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  // Fetch live quotes server-side once, then use them for filtering/sorting/display consistently
  const symbols = await getAllSymbols();
  const { quotes } = await getAllQuotes(symbols);
  const { companies, total, hiddenForQuality, hiddenEntries, usdEstimateEntries } = await getCompanies(queryParams, quotes);

  // Fetch last updated timestamp and distinct countries/sectors/industries for filter dropdowns
  const lastUpdated = await getLastUpdated();
  const countries = await getDistinctCountries();
  const sectors = await getDistinctSectors();
  const industries = await getDistinctIndustries();
  // Presets are a non-essential decoration — the page renders fine with just the
  // built-in defaults. getUserPresets() throws on a transient blob hiccup (kept
  // strict so the read-modify-write API paths abort rather than clobber), so a
  // failure here must degrade to "no user presets", never crash the whole page.
  const userPresets = await getUserPresets().catch((error) => {
    console.error("Failed to load user presets; rendering with built-ins only", error);
    return [];
  });

  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="relative border-b border-border-subtle bg-bg-secondary py-4 px-0 overflow-hidden">
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-grid-pattern opacity-50" />

        <div className="relative w-[95vw] mx-auto">
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
                US Stock Screener
              </h1>
              <p className="text-base text-text-secondary mt-1">
                Screen US-listed companies worth over $1B — by P/E, forward P/E, revenue & EPS growth, operating margin, and dividend yield.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-[95vw] max-w-none mx-auto px-0 pt-3 pb-6">
        <CompaniesTable
          companies={companies}
          total={total}
          sortBy={sortBy}
          sortOrder={sortOrder}
          countries={countries}
          sectors={sectors}
          industries={industries}
          userPresets={userPresets}
        />

        <Pagination
          currentPage={page}
          totalItems={total}
          perPage={PER_PAGE}
          lastUpdated={lastUpdated}
          hiddenForQuality={hiddenForQuality}
          hiddenEntries={hiddenEntries}
          usdEstimateEntries={usdEstimateEntries}
        />
      </div>
    </main>
  );
}
