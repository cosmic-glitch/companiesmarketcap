import CompaniesTable from "@/components/CompaniesTable";
import Pagination from "@/components/Pagination";
import { getAllSymbols, getCompanies, getDistinctCountries, getDistinctIndustries, getDistinctSectors, getLastUpdated, getUserPresets } from "@/lib/db";
import { getAllQuotes } from "@/lib/quotes";
import { Company, CompaniesQueryParams } from "@/lib/types";
import { formatCountry } from "@/lib/countries";
import { colKeyFromAlias, readParam } from "@/lib/url-aliases";
import Link from "next/link";
import Image from "next/image";

export const revalidate = 60; // Quote fields are cached for 1 minute

const PER_PAGE = 100;

// Loose because both legacy long-form keys (`minMarketCap`) and new aliases
// (`mc.min`, `sb`, …) need to read from the same bag without per-key types.
type SearchParams = Record<string, string | undefined>;

function getSubtitleText(sortBy: keyof Company, total: number, params: SearchParams): string {
  const get = (key: string) => readParam(params, key);

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
    forwardEPSGrowth: "Fwd EPS Growth",
    dividendPercent: "Div Yield",
    operatingMargin: "Op Margin",
    revenueGrowth5Y: "Rev Growth 5Y",
    revenueGrowth3Y: "Rev Growth 3Y",
    epsGrowth5Y: "EPS Growth 5Y",
    epsGrowth3Y: "EPS Growth 3Y",
    freeCashFlow: "FCF",
    netDebt: "Net Debt",
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
  const minMarketCap = get('minMarketCap');
  const maxMarketCap = get('maxMarketCap');
  if (minMarketCap && maxMarketCap) {
    filterDescriptions.push(`${formatMktCap(minMarketCap)} < Mkt Cap < ${formatMktCap(maxMarketCap)}`);
  } else if (minMarketCap) {
    filterDescriptions.push(`Mkt Cap > ${formatMktCap(minMarketCap)}`);
  } else if (maxMarketCap) {
    filterDescriptions.push(`Mkt Cap < ${formatMktCap(maxMarketCap)}`);
  }

  // Forward PE
  addFilter('Fwd PE', get('minForwardPE'), get('maxForwardPE'));

  // Forward EPS Growth
  addFilter('Fwd EPS Growth', get('minForwardEPSGrowth'), get('maxForwardEPSGrowth'), '%');

  // P/E Ratio
  addFilter('P/E', get('minPERatio'), get('maxPERatio'));

  // Dividend Yield
  addFilter('Div Yield', get('minDividend'), get('maxDividend'), '%');

  // Operating Margin
  addFilter('Op Margin', get('minOperatingMargin'), get('maxOperatingMargin'), '%');

  // Revenue Growth 5Y
  addFilter('Rev Growth 5Y', get('minRevenueGrowth'), get('maxRevenueGrowth'), '%');

  // Revenue Growth 3Y
  addFilter('Rev Growth 3Y', get('minRevenueGrowth3Y'), get('maxRevenueGrowth3Y'), '%');

  // EPS Growth 5Y
  addFilter('EPS Growth 5Y', get('minEPSGrowth'), get('maxEPSGrowth'), '%');

  // EPS Growth 3Y
  addFilter('EPS Growth 3Y', get('minEPSGrowth3Y'), get('maxEPSGrowth3Y'), '%');

  // % to 52W High
  addFilter('% to 52W High', get('minPctTo52WeekHigh'), get('maxPctTo52WeekHigh'), '%');

  // Earnings
  addFilter('Earnings', get('minEarnings'), get('maxEarnings'), 'B');

  // Revenue
  addFilter('Revenue', get('minRevenue'), get('maxRevenue'), 'B');

  // Free Cash Flow
  addFilter('FCF', get('minFreeCashFlow'), get('maxFreeCashFlow'), 'B');

  // Net Debt
  addFilter('Net Debt', get('minNetDebt'), get('maxNetDebt'), 'B');

  // Country
  const country = get('country');
  if (country) {
    filterDescriptions.push(`Country: ${formatCountry(country)}`);
  }

  // Sector
  const sector = get('sector');
  if (sector) {
    filterDescriptions.push(`Sector: ${sector}`);
  }

  // Industry
  const industry = get('industry');
  if (industry) {
    filterDescriptions.push(`Industry: ${industry}`);
  }

  const countText = total.toLocaleString();
  const sortLabel = sortLabels[sortBy] || "market capitalization";

  if (filterDescriptions.length > 0) {
    const criteria = filterDescriptions.join(', ');
    return `${countText} companies match ${criteria} — ordered by ${sortLabel}`;
  }
  return `${countText} companies, ordered by ${sortLabel}`;
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
  const { companies, total, hiddenForQuality, hiddenEntries } = await getCompanies(queryParams, quotes);

  // Fetch last updated timestamp and distinct countries/sectors/industries for filter dropdowns
  const lastUpdated = await getLastUpdated();
  const countries = await getDistinctCountries();
  const sectors = await getDistinctSectors();
  const industries = await getDistinctIndustries();
  const userPresets = await getUserPresets();

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
                Largest Companies by Market Cap
              </h1>
              <p className="text-base text-text-secondary mt-1">
                {getSubtitleText(sortBy, total, params)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-[95vw] max-w-none mx-auto px-0 pt-3 pb-6">
        <CompaniesTable
          companies={companies}
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
        />
      </div>
    </main>
  );
}
