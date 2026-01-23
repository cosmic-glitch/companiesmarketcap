"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Company } from "@/lib/types";
import { formatMarketCap, formatPrice, formatPercent, formatPERatio, cn } from "@/lib/utils";

// Company logo component with fallback
function CompanyLogo({ symbol, name }: { symbol: string; name: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-8 h-8 bg-slate-200 rounded flex items-center justify-center text-xs font-medium text-slate-600 flex-shrink-0">
        {name.charAt(0)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logos/${symbol}.webp`}
      alt={name}
      className="w-8 h-8 rounded flex-shrink-0 object-cover"
      onError={() => setError(true)}
    />
  );
}

// Daily change component with color coding
function DailyChange({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400">-</span>;
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  const formattedValue = `${isPositive ? "+" : ""}${value.toFixed(2)}%`;

  return (
    <span
      className={cn(
        "font-medium",
        isPositive && "text-green-600",
        isNegative && "text-red-600",
        !isPositive && !isNegative && "text-slate-500"
      )}
    >
      {formattedValue}
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
  minPERatio: string;
  maxPERatio: string;
  minDividend: string;
  maxDividend: string;
  minOperatingMargin: string;
  maxOperatingMargin: string;
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
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <div className="grid grid-cols-2 gap-1.5">
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
          className="px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
          className="px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
    minPERatio: searchParams.get("minPERatio") || "",
    maxPERatio: searchParams.get("maxPERatio") || "",
    minDividend: searchParams.get("minDividend") || "",
    maxDividend: searchParams.get("maxDividend") || "",
    minOperatingMargin: searchParams.get("minOperatingMargin") || "",
    maxOperatingMargin: searchParams.get("maxOperatingMargin") || "",
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
      minPERatio: "",
      maxPERatio: "",
      minDividend: "",
      maxDividend: "",
      minOperatingMargin: "",
      maxOperatingMargin: "",
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
    "minPERatio", "maxPERatio",
    "minDividend", "maxDividend",
    "minOperatingMargin", "maxOperatingMargin"
  ].some(key => searchParams.has(key));

  // Check if pending filters are different from URL filters
  const currentFilters = getInitialFilters();
  const hasUnappliedChanges = JSON.stringify(pendingFilters) !== JSON.stringify(currentFilters);

  // Sort indicator component
  const SortIndicator = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortBy !== columnKey) {
      return <span className="text-slate-400 ml-1">↕</span>;
    }
    return <span className="text-blue-600 ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="w-full">
      {/* Filter Panel */}
      <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
            label="P/E Ratio"
            minKey="minPERatio"
            maxKey="maxPERatio"
            placeholder=""
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Dividend Yield %"
            minKey="minDividend"
            maxKey="maxDividend"
            placeholder="%"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <FilterInput
            label="Operating Margin %"
            minKey="minOperatingMargin"
            maxKey="maxOperatingMargin"
            placeholder="%"
            pendingFilters={pendingFilters}
            updateFilter={updateFilter}
            applyFilters={applyFilters}
          />
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              disabled={!hasUnappliedChanges}
              className={cn(
                "flex-1 px-4 py-1.5 text-xs font-medium rounded transition-colors",
                hasUnappliedChanges
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              Apply
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th
                onClick={() => handleSort("rank")}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors w-16"
              >
                Rank <SortIndicator columnKey="rank" />
              </th>
              <th
                onClick={() => handleSort("name")}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Name <SortIndicator columnKey="name" />
              </th>
              <th
                onClick={() => handleSort("marketCap")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Market cap <SortIndicator columnKey="marketCap" />
              </th>
              <th
                onClick={() => handleSort("price")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Price <SortIndicator columnKey="price" />
              </th>
              <th
                onClick={() => handleSort("dailyChangePercent")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Today <SortIndicator columnKey="dailyChangePercent" />
              </th>
              <th
                onClick={() => handleSort("earnings")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Earnings <SortIndicator columnKey="earnings" />
              </th>
              <th
                onClick={() => handleSort("revenue")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Revenue <SortIndicator columnKey="revenue" />
              </th>
              <th
                onClick={() => handleSort("peRatio")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                P/E ratio <SortIndicator columnKey="peRatio" />
              </th>
              <th
                onClick={() => handleSort("dividendPercent")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Dividend % <SortIndicator columnKey="dividendPercent" />
              </th>
              <th
                onClick={() => handleSort("operatingMargin")}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Op. margin <SortIndicator columnKey="operatingMargin" />
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {companies.map((company, index) => (
              <tr
                key={company.symbol}
                className={cn(
                  "hover:bg-slate-50 transition-colors border-b border-slate-100",
                  index % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                )}
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-500 w-16">{company.rank}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <CompanyLogo symbol={company.symbol} name={company.name} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{company.name}</div>
                      <div className="text-xs text-slate-500">{company.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-slate-900 font-medium">
                  {formatMarketCap(company.marketCap)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-slate-900">
                  {formatPrice(company.price)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right">
                  <DailyChange value={company.dailyChangePercent} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-slate-900">
                  {formatMarketCap(company.earnings)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-slate-900">
                  {formatMarketCap(company.revenue)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-slate-900">
                  {formatPERatio(company.peRatio)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-slate-900">
                  {formatPercent(company.dividendPercent)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-slate-900">
                  {formatPercent(company.operatingMargin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {companies.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <svg className="mx-auto h-12 w-12 text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-medium">No companies found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}
