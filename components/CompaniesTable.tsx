"use client";

import { useState, useEffect } from "react";
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
  lastUpdated?: string;
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
type SortOrder = "asc" | "desc";

// Default filter values
const DEFAULT_FILTERS: FilterState = {
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

// Filter input component (defined outside to prevent re-creation on render)
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

export default function CompaniesTable({ companies: initialCompanies, lastUpdated }: CompaniesTableProps) {
  const [filteredCompanies, setFilteredCompanies] = useState(initialCompanies);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Apply filters
  useEffect(() => {
    let result = [...initialCompanies];

    // Apply range filters
    result = result.filter((company) => {
      // Market Cap filter (in billions)
      if (company.marketCap) {
        const capInBillions = company.marketCap / 1_000_000_000;
        const min = parseFloat(filters.minMarketCap);
        const max = parseFloat(filters.maxMarketCap);
        if (!isNaN(min) && capInBillions < min) return false;
        if (!isNaN(max) && capInBillions > max) return false;
      }

      // Earnings filter (in billions)
      if (company.earnings !== null) {
        const earningsInBillions = company.earnings / 1_000_000_000;
        const min = parseFloat(filters.minEarnings);
        const max = parseFloat(filters.maxEarnings);
        if (!isNaN(min) && earningsInBillions < min) return false;
        if (!isNaN(max) && earningsInBillions > max) return false;
      }

      // P/E Ratio filter
      if (company.peRatio) {
        const min = parseFloat(filters.minPERatio);
        const max = parseFloat(filters.maxPERatio);
        if (!isNaN(min) && company.peRatio < min) return false;
        if (!isNaN(max) && company.peRatio > max) return false;
      }

      // Dividend % filter
      if (company.dividendPercent !== null) {
        const min = parseFloat(filters.minDividend);
        const max = parseFloat(filters.maxDividend);
        if (!isNaN(min) && company.dividendPercent < min) return false;
        if (!isNaN(max) && company.dividendPercent > max) return false;
      }

      // Operating Margin % filter
      if (company.operatingMargin !== null) {
        const min = parseFloat(filters.minOperatingMargin);
        const max = parseFloat(filters.maxOperatingMargin);
        if (!isNaN(min) && company.operatingMargin < min) return false;
        if (!isNaN(max) && company.operatingMargin > max) return false;
      }

      return true;
    });

    // Apply sorting
    result.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      } else if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return 0;
    });

    setFilteredCompanies(result);
  }, [initialCompanies, filters, sortKey, sortOrder]);

  // Handle sorting
  const handleSort = (key: SortKey) => {
    const newOrder = sortKey === key && sortOrder === "asc" ? "desc" : "asc";
    setSortKey(key);
    setSortOrder(newOrder);
  };

  // Apply pending filters
  const applyFilters = () => {
    setFilters(pendingFilters);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPendingFilters(DEFAULT_FILTERS);
  };

  // Update pending filter value (doesn't apply filter yet)
  const updateFilter = (key: keyof FilterState, value: string) => {
    setPendingFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Check if any filters are active
  const hasActiveFilters = Object.values(filters).some((value) => value !== "");

  // Check if pending filters are different from applied filters
  const hasUnappliedChanges = JSON.stringify(pendingFilters) !== JSON.stringify(filters);

  // Sort indicator component
  const SortIndicator = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <span className="text-slate-400 ml-1">↕</span>;
    }
    return <span className="text-blue-600 ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="w-full">
      {/* Compact Filter Panel */}
      <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Filters</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={applyFilters}
              disabled={!hasUnappliedChanges}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded transition-colors",
                hasUnappliedChanges
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              Apply Filters
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
              >
                Clear All
              </button>
            )}
            {lastUpdated && (
              <p className="text-xs text-slate-500">Updated: {new Date(lastUpdated).toLocaleString()}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Showing <span className="font-semibold text-slate-900">{filteredCompanies.length.toLocaleString()}</span> of{" "}
          <span className="font-semibold text-slate-900">{initialCompanies.length.toLocaleString()}</span> companies
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
            {filteredCompanies.map((company, index) => (
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

      {filteredCompanies.length === 0 && (
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
