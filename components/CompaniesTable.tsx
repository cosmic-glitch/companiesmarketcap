"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Company } from "@/lib/types";
import { formatMarketCap, formatPrice, formatPercent, formatPERatio, formatCAGR, cn } from "@/lib/utils";

// Company logo component with fallback
function CompanyLogo({ symbol, name }: { symbol: string; name: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-8 h-8 bg-bg-tertiary rounded flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0">
        {name.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      src={`/logos/${symbol}.webp`}
      alt={name}
      width={32}
      height={32}
      className="rounded flex-shrink-0 object-cover bg-white p-0.5"
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}

// Daily change component with color-coded badges
function DailyChange({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-text-muted">-</span>;
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  const formattedValue = `${isPositive ? "+" : ""}${value.toFixed(2)}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium",
        isPositive && "bg-positive/10 text-positive",
        isNegative && "bg-negative/10 text-negative",
        !isPositive && !isNegative && "bg-bg-tertiary text-text-muted"
      )}
    >
      {isPositive && "▲ "}
      {isNegative && "▼ "}
      {formattedValue}
    </span>
  );
}

// Rank badge with special styling for top companies
function RankBadge({ rank }: { rank: number }) {
  const isTop3 = rank <= 3;
  const isTop10 = rank <= 10;

  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        isTop3 && "text-accent font-bold",
        !isTop3 && isTop10 && "text-accent/70",
        !isTop10 && "text-text-secondary"
      )}
    >
      {rank}
    </span>
  );
}

interface CompaniesTableProps {
  companies: Company[];
  sortBy: keyof Company;
  sortOrder: "asc" | "desc";
}

interface FilterState {
  minMarketCap: string;
  maxMarketCap: string;
  minEarnings: string;
  maxEarnings: string;
  minRevenue: string;
  maxRevenue: string;
  minPERatio: string;
  maxPERatio: string;
  minForwardPE: string;
  maxForwardPE: string;
  minDividend: string;
  maxDividend: string;
  minOperatingMargin: string;
  maxOperatingMargin: string;
  minRevenueGrowth: string;
  maxRevenueGrowth: string;
  minEPSGrowth: string;
  maxEPSGrowth: string;
}

type SortKey = keyof Company;

// Filter input component
interface FilterInputProps {
  label: string;
  minKey: keyof FilterState;
  maxKey: keyof FilterState;
  placeholder: string;
  pendingFilters: FilterState;
  updateFilter: (key: keyof FilterState, value: string) => void;
  applyFilters: () => void;
}

const FilterInput = ({
  label,
  minKey,
  maxKey,
  placeholder,
  pendingFilters,
  updateFilter,
  applyFilters
}: FilterInputProps) => {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-secondary uppercase tracking-wider">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder={`Min ${placeholder}`}
          value={pendingFilters[minKey]}
          onChange={(e) => updateFilter(minKey, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyFilters();
            }
          }}
          className="px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <input
          type="number"
          placeholder={`Max ${placeholder}`}
          value={pendingFilters[maxKey]}
          onChange={(e) => updateFilter(maxKey, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyFilters();
            }
          }}
          className="px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
};

export default function CompaniesTable({ companies, sortBy, sortOrder }: CompaniesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize pending filters from URL
  const getInitialFilters = useCallback((): FilterState => ({
    minMarketCap: searchParams.get("minMarketCap") || "",
    maxMarketCap: searchParams.get("maxMarketCap") || "",
    minEarnings: searchParams.get("minEarnings") || "",
    maxEarnings: searchParams.get("maxEarnings") || "",
    minRevenue: searchParams.get("minRevenue") || "",
    maxRevenue: searchParams.get("maxRevenue") || "",
    minPERatio: searchParams.get("minPERatio") || "",
    maxPERatio: searchParams.get("maxPERatio") || "",
    minForwardPE: searchParams.get("minForwardPE") || "",
    maxForwardPE: searchParams.get("maxForwardPE") || "",
    minDividend: searchParams.get("minDividend") || "",
    maxDividend: searchParams.get("maxDividend") || "",
    minOperatingMargin: searchParams.get("minOperatingMargin") || "",
    maxOperatingMargin: searchParams.get("maxOperatingMargin") || "",
    minRevenueGrowth: searchParams.get("minRevenueGrowth") || "",
    maxRevenueGrowth: searchParams.get("maxRevenueGrowth") || "",
    minEPSGrowth: searchParams.get("minEPSGrowth") || "",
    maxEPSGrowth: searchParams.get("maxEPSGrowth") || "",
  }), [searchParams]);

  const [pendingFilters, setPendingFilters] = useState<FilterState>(getInitialFilters);

  // Build URL with parameters
  const buildUrl = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    // Apply updates
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const queryString = params.toString();
    return queryString ? `/?${queryString}` : "/";
  }, [searchParams]);

  // Handle sorting - clicking a column header
  const handleSort = (key: SortKey) => {
    const newOrder = sortBy === key && sortOrder === "asc" ? "desc" : "asc";
    router.push(buildUrl({
      sortBy: key,
      sortOrder: newOrder,
      page: undefined, // Reset to page 1 on sort change
    }));
  };

  // Apply pending filters
  const applyFilters = () => {
    const updates: Record<string, string | undefined> = {
      page: undefined, // Reset to page 1 on filter change
    };

    // Add all filter values
    Object.entries(pendingFilters).forEach(([key, value]) => {
      updates[key] = value || undefined;
    });

    router.push(buildUrl(updates));
  };

  // Clear all filters
  const clearFilters = () => {
    const emptyFilters: FilterState = {
      minMarketCap: "",
      maxMarketCap: "",
      minEarnings: "",
      maxEarnings: "",
      minRevenue: "",
      maxRevenue: "",
      minPERatio: "",
      maxPERatio: "",
      minForwardPE: "",
      maxForwardPE: "",
      minDividend: "",
      maxDividend: "",
      minOperatingMargin: "",
      maxOperatingMargin: "",
      minRevenueGrowth: "",
      maxRevenueGrowth: "",
      minEPSGrowth: "",
      maxEPSGrowth: "",
    };
    setPendingFilters(emptyFilters);

    // Build URL without any filter params
    const params = new URLSearchParams();
    if (sortBy !== "rank") params.set("sortBy", sortBy);
    if (sortOrder !== "asc") params.set("sortOrder", sortOrder);
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  // Update pending filter value (doesn't apply filter yet)
  const updateFilter = (key: keyof FilterState, value: string) => {
    setPendingFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Check if any filters are active (in URL)
  const hasActiveFilters = [
    "minMarketCap", "maxMarketCap",
    "minEarnings", "maxEarnings",
    "minRevenue", "maxRevenue",
    "minPERatio", "maxPERatio",
    "minForwardPE", "maxForwardPE",
    "minDividend", "maxDividend",
    "minOperatingMargin", "maxOperatingMargin",
    "minRevenueGrowth", "maxRevenueGrowth",
    "minEPSGrowth", "maxEPSGrowth"
  ].some(key => searchParams.has(key));

  // Check if pending filters are different from URL filters
  const currentFilters = getInitialFilters();
  const hasUnappliedChanges = JSON.stringify(pendingFilters) !== JSON.stringify(currentFilters);

  // Sort indicator component
  const SortIndicator = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortBy !== columnKey) {
      return <span className="text-text-muted ml-1 opacity-50">↕</span>;
    }
    return <span className="text-accent ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="w-full">
      {/* Filter Panel */}
      <div className="mb-4 bg-bg-secondary border border-border-subtle rounded-2xl p-5 shadow-lg">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4">
          <FilterInput
            label="Market Cap"
            minKey="minMarketCap"
            maxKey="maxMarketCap"
            placeholder="billions"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Earnings (TTM)"
            minKey="minEarnings"
            maxKey="maxEarnings"
            placeholder="billions"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Revenue (TTM)"
            minKey="minRevenue"
            maxKey="maxRevenue"
            placeholder="billions"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="P/E Ratio"
            minKey="minPERatio"
            maxKey="maxPERatio"
            placeholder=""
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Fwd P/E"
            minKey="minForwardPE"
            maxKey="maxForwardPE"
            placeholder=""
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Div. Yield %"
            minKey="minDividend"
            maxKey="maxDividend"
            placeholder="%"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Op. Margin %"
            minKey="minOperatingMargin"
            maxKey="maxOperatingMargin"
            placeholder="%"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Rev CAGR 5Y"
            minKey="minRevenueGrowth"
            maxKey="maxRevenueGrowth"
            placeholder="%"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="EPS CAGR 5Y"
            minKey="minEPSGrowth"
            maxKey="maxEPSGrowth"
            placeholder="%"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
        </div>
        <div className="flex justify-start gap-2 mt-4">
          <button
            onClick={applyFilters}
            disabled={!hasUnappliedChanges}
            className={cn(
              "px-6 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300",
              hasUnappliedChanges
                ? "bg-accent text-white hover:bg-accent-hover hover:shadow-glow hover:scale-[1.02]"
                : "bg-[#e0f7fa] text-[#0891b2]/50 cursor-not-allowed"
            )}
          >
            Apply Filters
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary bg-bg-tertiary border border-border-subtle rounded-lg hover:bg-bg-hover hover:text-text-primary transition-all duration-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-bg-secondary border border-border-subtle rounded-2xl shadow-lg">
        <table className="min-w-full">
          <thead className="bg-bg-tertiary/50 border-b border-border-subtle">
            <tr>
              <th
                onClick={() => handleSort("name")}
                className="px-4 py-4 text-left text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Name <SortIndicator columnKey="name" />
              </th>
              <th
                onClick={() => handleSort("marketCap")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Market Cap <SortIndicator columnKey="marketCap" />
              </th>
              <th
                onClick={() => handleSort("price")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Price <SortIndicator columnKey="price" />
              </th>
              <th
                onClick={() => handleSort("dailyChangePercent")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Today <SortIndicator columnKey="dailyChangePercent" />
              </th>
              <th
                onClick={() => handleSort("earnings")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Earnings <SortIndicator columnKey="earnings" />
              </th>
              <th
                onClick={() => handleSort("revenue")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Revenue <SortIndicator columnKey="revenue" />
              </th>
              <th
                onClick={() => handleSort("peRatio")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                P/E <SortIndicator columnKey="peRatio" />
              </th>
              <th
                onClick={() => handleSort("forwardPE")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Fwd P/E <SortIndicator columnKey="forwardPE" />
              </th>
              <th
                onClick={() => handleSort("dividendPercent")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Div % <SortIndicator columnKey="dividendPercent" />
              </th>
              <th
                onClick={() => handleSort("operatingMargin")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Op. Margin % <SortIndicator columnKey="operatingMargin" />
              </th>
              <th
                onClick={() => handleSort("revenueGrowth5Y")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                Rev CAGR 5Y <SortIndicator columnKey="revenueGrowth5Y" />
              </th>
              <th
                onClick={() => handleSort("epsGrowth5Y")}
                className="px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors"
              >
                EPS CAGR 5Y <SortIndicator columnKey="epsGrowth5Y" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {companies.map((company, index) => (
              <tr
                key={company.symbol}
                className={cn(
                  "group hover:bg-bg-tertiary/30 transition-all duration-200",
                  index % 2 === 0 ? "bg-transparent" : "bg-bg-tertiary/10"
                )}
              >
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <CompanyLogo symbol={company.symbol} name={company.name} />
                    <div className="min-w-0">
                      <div className="text-base font-medium text-text-primary truncate group-hover:text-accent transition-colors">{company.name}</div>
                      <div className="text-sm text-text-muted">{company.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-primary font-semibold">
                  {formatMarketCap(company.marketCap)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-primary">
                  {formatPrice(company.price)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right">
                  <DailyChange value={company.dailyChangePercent} />
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatMarketCap(company.earnings)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatMarketCap(company.revenue)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatPERatio(company.peRatio)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatPERatio(company.forwardPE)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatPercent(company.dividendPercent !== null ? company.dividendPercent * 100 : null)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatPercent(company.operatingMargin !== null ? company.operatingMargin * 100 : null)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatCAGR(company.revenueGrowth5Y)}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary">
                  {formatCAGR(company.epsGrowth5Y)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {companies.length === 0 && (
        <div className="text-center py-16 text-text-secondary">
          <svg className="mx-auto h-12 w-12 text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-medium text-text-primary">No companies found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}
