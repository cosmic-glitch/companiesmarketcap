"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Company } from "@/lib/types";
import { formatMarketCap, formatPrice, formatPercent, formatPERatio, formatCAGR, cn } from "@/lib/utils";
import { formatCountry } from "@/lib/countries";

// Preset filter configurations
interface PresetConfig {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  filters: Record<string, string>;
  sort: { sortBy?: string; sortOrder?: 'asc' | 'desc' };
}

const PRESETS: PresetConfig[] = [
  {
    id: 'mega-cap-value',
    label: 'Mega Cap Value',
    subtitle: '$1T+, Fwd PE < 25',
    icon: '🏦',
    filters: { minMarketCap: '1000', maxForwardPE: '25' },
    sort: { sortBy: 'forwardPE', sortOrder: 'asc' },
  },
  {
    id: 'garp',
    label: 'Great Price for Reasonable Growth',
    subtitle: '$100B+, Fwd PE < 15, 20%+ Op Margin, 10%+ Rev Growth 3Y, 10%+ EPS Growth 3Y',
    icon: '📈',
    filters: { minMarketCap: '100', maxForwardPE: '15', minOperatingMargin: '20', minRevenueGrowth3Y: '10', minEPSGrowth3Y: '10' },
    sort: { sortBy: 'forwardPE', sortOrder: 'asc' },
  },
  {
    id: 'reliable-dividends',
    label: 'Reliable Dividend Generators',
    subtitle: '$10B+, 6%+ Yield, 5%+ Rev Growth, 5%+ EPS Growth',
    icon: '💰',
    filters: { minMarketCap: '10', minDividend: '6', minRevenueGrowth: '5', minEPSGrowth: '5' },
    sort: { sortBy: 'dividendPercent', sortOrder: 'desc' },
  },
];

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

// Inline SVG bar chart showing annual revenue trend.
// Storage order is newest-first; render oldest→newest (left→right).
function RevenueSparkline({ values }: { values: { year: number; revenue: number }[] | null }) {
  if (!values || values.length < 2) {
    return <span className="text-text-muted">-</span>;
  }

  const ordered = [...values].reverse();
  const width = 104;
  const height = 28;
  const gap = 2;
  const barWidth = (width - gap * (ordered.length - 1)) / ordered.length;
  const maxRevenue = Math.max(...ordered.map((v) => v.revenue));
  // Floor at 2px so non-zero tiny values stay visible.
  const minBarHeight = 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      aria-label="10-year revenue trend"
    >
      {ordered.map((v, i) => {
        const scaled = maxRevenue > 0 ? (v.revenue / maxRevenue) * height : 0;
        const barHeight = Math.max(scaled, minBarHeight);
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        return (
          <rect
            key={v.year}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill="rgba(148, 163, 184, 0.6)"
          >
            <title>{`${v.year}: ${formatMarketCap(v.revenue)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// Zero-baseline sparkline for annual diluted-EPS. Positive bars above the
// axis (accent), negative bars below (red). Axis position is proportional
// to the pos/neg range so both polarities stay visible. Self-scaled per
// company — no cross-row comparison.
function EpsSparkline({ values }: { values: { year: number; eps: number }[] | null }) {
  if (!values || values.length < 2) {
    return <span className="text-text-muted">-</span>;
  }

  const ordered = [...values].reverse();
  const width = 104;
  const height = 28;
  const gap = 2;
  const barWidth = (width - gap * (ordered.length - 1)) / ordered.length;
  const maxPos = Math.max(0, ...ordered.map((v) => v.eps));
  const maxNeg = Math.max(0, ...ordered.map((v) => -v.eps));
  const range = maxPos + maxNeg;
  const zeroY = range > 0 ? (maxPos / range) * height : height;
  const minBar = 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      aria-label="10-year EPS trend"
    >
      {ordered.map((v, i) => {
        const x = i * (barWidth + gap);
        const absEps = Math.abs(v.eps);
        if (v.eps >= 0) {
          const scaled = maxPos > 0 ? (absEps / maxPos) * zeroY : 0;
          const h = absEps > 0 ? Math.max(scaled, minBar) : 0;
          return (
            <rect
              key={v.year}
              x={x}
              y={zeroY - h}
              width={barWidth}
              height={h}
              fill="rgba(148, 163, 184, 0.6)"
            >
              <title>{`${v.year}: ${v.eps.toFixed(2)}`}</title>
            </rect>
          );
        }
        const maxDown = height - zeroY;
        const scaled = maxNeg > 0 ? (absEps / maxNeg) * maxDown : 0;
        const h = Math.max(scaled, minBar);
        return (
          <rect
            key={v.year}
            x={x}
            y={zeroY}
            width={barWidth}
            height={h}
            fill="rgba(220, 38, 38, 0.65)"
          >
            <title>{`${v.year}: ${v.eps.toFixed(2)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

interface CompaniesTableProps {
  companies: Company[];
  sortBy: keyof Company;
  sortOrder: "asc" | "desc";
  countries: string[];
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
  minRevenueGrowth3Y: string;
  maxRevenueGrowth3Y: string;
  minEPSGrowth: string;
  maxEPSGrowth: string;
  minEPSGrowth3Y: string;
  maxEPSGrowth3Y: string;
  minPctTo52WeekHigh: string;
  maxPctTo52WeekHigh: string;
  country: string;
}

const FILTER_KEYS: (keyof FilterState)[] = [
  "minMarketCap", "maxMarketCap",
  "minEarnings", "maxEarnings",
  "minRevenue", "maxRevenue",
  "minPERatio", "maxPERatio",
  "minForwardPE", "maxForwardPE",
  "minDividend", "maxDividend",
  "minOperatingMargin", "maxOperatingMargin",
  "minRevenueGrowth", "maxRevenueGrowth",
  "minRevenueGrowth3Y", "maxRevenueGrowth3Y",
  "minEPSGrowth", "maxEPSGrowth",
  "minEPSGrowth3Y", "maxEPSGrowth3Y",
  "minPctTo52WeekHigh", "maxPctTo52WeekHigh",
  "country",
];

type SortKey = keyof Company;

interface ColumnOption {
  key: SortKey;
  label: string;
  defaultVisible: boolean;
}

// Dropdown trigger button
interface DropdownButtonProps {
  label: string;
  isActive: boolean;
  isOpen: boolean;
  onClick: () => void;
  badge?: number;
}

const DropdownButton = ({ label, isActive, isOpen, onClick, badge }: DropdownButtonProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border transition-colors whitespace-nowrap",
      isActive
        ? "bg-accent/15 border-accent/40 text-accent"
        : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-accent/50 hover:text-text-primary"
    )}
  >
    {label}
    {badge !== undefined && badge > 0 && (
      <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0 rounded-full leading-4">{badge}</span>
    )}
    <span className={cn("text-[10px] transition-transform", isOpen && "rotate-180")}>▾</span>
  </button>
);

// Min/Max input pair for the filter panel grid
interface FilterGridInputProps {
  label: string;
  minKey: keyof FilterState;
  maxKey: keyof FilterState;
  pendingFilters: FilterState;
  updateFilter: (key: keyof FilterState, value: string) => void;
  applyFilters: () => void;
}

const FilterGridInput = ({ label, minKey, maxKey, pendingFilters, updateFilter, applyFilters }: FilterGridInputProps) => (
  <div>
    <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1">{label}</label>
    <div className="grid grid-cols-2 gap-1.5">
      <input
        type="number"
        placeholder="Min"
        value={pendingFilters[minKey]}
        onChange={(e) => updateFilter(minKey, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
        className="px-2 py-1.5 text-xs bg-bg-secondary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <input
        type="number"
        placeholder="Max"
        value={pendingFilters[maxKey]}
        onChange={(e) => updateFilter(maxKey, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
        className="px-2 py-1.5 text-xs bg-bg-secondary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  </div>
);

const COLUMN_OPTIONS: readonly ColumnOption[] = [
  { key: "country", label: "Country", defaultVisible: true },
  { key: "marketCap", label: "Market Cap", defaultVisible: true },
  { key: "price", label: "Price", defaultVisible: true },
  { key: "dailyChangePercent", label: "Today", defaultVisible: true },
  { key: "pctTo52WeekHigh", label: "% to 52W High", defaultVisible: true },
  { key: "earnings", label: "Earnings", defaultVisible: false },
  { key: "revenue", label: "Revenue", defaultVisible: false },
  { key: "peRatio", label: "P/E", defaultVisible: true },
  { key: "forwardPE", label: "Fwd P/E", defaultVisible: true },
  { key: "dividendPercent", label: "Div %", defaultVisible: false },
  { key: "operatingMargin", label: "Op. Margin %", defaultVisible: false },
  { key: "revenueGrowth5Y", label: "Rev CAGR 5Y", defaultVisible: false },
  { key: "revenueGrowth3Y", label: "Rev CAGR 3Y", defaultVisible: true },
  { key: "epsGrowth5Y", label: "EPS CAGR 5Y", defaultVisible: false },
  { key: "epsGrowth3Y", label: "EPS CAGR 3Y", defaultVisible: true },
  { key: "revenueAnnual", label: "10Y Rev Trend", defaultVisible: true },
  { key: "epsAnnual", label: "10Y EPS Trend", defaultVisible: true },
];

const ALWAYS_VISIBLE_COLUMNS = new Set<SortKey>(["rank", "name"]);

const DEFAULT_VISIBLE_COLUMNS = new Set<SortKey>(
  COLUMN_OPTIONS.filter((column) => column.defaultVisible).map((column) => column.key)
);

export default function CompaniesTable({ companies, sortBy: sortByProp, sortOrder: sortOrderProp, countries }: CompaniesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const previousFilterSignatureRef = useRef<string | null>(null);
  const dropdownBarRef = useRef<HTMLDivElement>(null);

  // Column visibility state (resets on every page load)
  const [visibleColumns, setVisibleColumns] = useState<Set<SortKey>>(() => new Set(DEFAULT_VISIBLE_COLUMNS));

  const toggleColumn = (key: SortKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Track sort state locally for immediate UI updates, synced with URL
  const [sortBy, setSortBy] = useState<keyof Company>(
    (searchParams.get('sortBy') as keyof Company) || sortByProp
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    (searchParams.get('sortOrder') as 'asc' | 'desc') || sortOrderProp
  );

  // Sync local state when URL changes (e.g., browser back/forward, preset clicks)
  useEffect(() => {
    const urlSortBy = (searchParams.get('sortBy') as keyof Company) || sortByProp;
    const urlSortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || sortOrderProp;
    setSortBy(urlSortBy);
    setSortOrder(urlSortOrder);
  }, [searchParams, sortByProp, sortOrderProp]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownBarRef.current && !dropdownBarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll the company list back to the top whenever applied filters change.
  const filterSignature = useMemo(
    () => FILTER_KEYS.map((key) => `${key}:${searchParams.get(key) ?? ""}`).join("|"),
    [searchParams]
  );

  useEffect(() => {
    if (previousFilterSignatureRef.current === null) {
      previousFilterSignatureRef.current = filterSignature;
      return;
    }

    if (previousFilterSignatureRef.current !== filterSignature) {
      tableScrollRef.current?.scrollTo({ top: 0 });
      previousFilterSignatureRef.current = filterSignature;
    }
  }, [filterSignature]);

  // Detect which preset is currently active based on URL params
  const activePreset = useMemo(() => {
    for (const preset of PRESETS) {
      // Check if all preset filters match
      const allFiltersMatch = Object.entries(preset.filters).every(
        ([key, value]) => searchParams.get(key) === value
      );

      // Check if sort matches (if preset has sort specified)
      const sortMatches = !preset.sort.sortBy ||
        (searchParams.get('sortBy') === preset.sort.sortBy &&
         searchParams.get('sortOrder') === preset.sort.sortOrder);

      // Also check that there are no extra filters in URL that aren't in preset
      const activeFilterKeys = FILTER_KEYS.filter((key) => searchParams.has(key));
      const presetFilterKeys = Object.keys(preset.filters);
      const noExtraFilters = activeFilterKeys.length === presetFilterKeys.length;

      if (allFiltersMatch && sortMatches && noExtraFilters) {
        return preset.id;
      }
    }
    return null;
  }, [searchParams]);

  // Apply a preset's filters and sort
  const applyPreset = useCallback((preset: PresetConfig) => {
    const params = new URLSearchParams();

    // Apply preset filters
    Object.entries(preset.filters).forEach(([key, value]) => {
      params.set(key, value);
    });

    // Apply preset sort if specified
    if (preset.sort.sortBy) {
      params.set('sortBy', preset.sort.sortBy);
      params.set('sortOrder', preset.sort.sortOrder!);
      // Update local state immediately for instant visual feedback
      setSortBy(preset.sort.sortBy as keyof Company);
      setSortOrder(preset.sort.sortOrder!);
    }

    router.push(`/?${params.toString()}`);
  }, [router]);

  // Clear all filters (when clicking active preset)
  const clearAllFilters = useCallback(() => {
    // Reset to default sort immediately for instant visual feedback
    setSortBy(sortByProp);
    setSortOrder(sortOrderProp);
    router.push('/');
  }, [router, sortByProp, sortOrderProp]);

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
    minRevenueGrowth3Y: searchParams.get("minRevenueGrowth3Y") || "",
    maxRevenueGrowth3Y: searchParams.get("maxRevenueGrowth3Y") || "",
    minEPSGrowth: searchParams.get("minEPSGrowth") || "",
    maxEPSGrowth: searchParams.get("maxEPSGrowth") || "",
    minEPSGrowth3Y: searchParams.get("minEPSGrowth3Y") || "",
    maxEPSGrowth3Y: searchParams.get("maxEPSGrowth3Y") || "",
    minPctTo52WeekHigh: searchParams.get("minPctTo52WeekHigh") || "",
    maxPctTo52WeekHigh: searchParams.get("maxPctTo52WeekHigh") || "",
    country: searchParams.get("country") || "",
  }), [searchParams]);

  const [pendingFilters, setPendingFilters] = useState<FilterState>(getInitialFilters);

  // Sync pending filters when URL changes (e.g., when a preset is applied)
  useEffect(() => {
    setPendingFilters(getInitialFilters());
  }, [searchParams, getInitialFilters]);

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
    // Update local state immediately for instant visual feedback
    setSortBy(key);
    setSortOrder(newOrder);
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
      minRevenueGrowth3Y: "",
      maxRevenueGrowth3Y: "",
      minEPSGrowth: "",
      maxEPSGrowth: "",
      minEPSGrowth3Y: "",
      maxEPSGrowth3Y: "",
      minPctTo52WeekHigh: "",
      maxPctTo52WeekHigh: "",
      country: "",
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
  const hasActiveFilters = FILTER_KEYS.some((key) => searchParams.has(key));

  // Check if pending filters are different from URL filters
  const currentFilters = getInitialFilters();
  const hasUnappliedChanges = JSON.stringify(pendingFilters) !== JSON.stringify(currentFilters);

  // Count active filters for badge
  const activeFilterCount = FILTER_KEYS.filter((key) => searchParams.has(key)).length;

  // Apply filters and close dropdown
  const applyFiltersAndClose = () => {
    applyFilters();
    setOpenDropdown(null);
  };

  // Clear filters and close dropdown
  const clearFiltersAndClose = () => {
    clearFilters();
    setOpenDropdown(null);
  };

  // Sort indicator component
  const SortIndicator = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortBy !== columnKey) {
      return <span className="text-text-muted ml-1 opacity-50">↕</span>;
    }
    return <span className="text-accent ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };

  // Helper to check if a column is the sorted column
  const isSortedColumn = (columnKey: SortKey) => sortBy === columnKey;
  const isColumnVisible = (columnKey: SortKey) => ALWAYS_VISIBLE_COLUMNS.has(columnKey) || visibleColumns.has(columnKey);

  return (
    <div className="w-full">
      {/* Dropdown Filter Bar */}
      <div ref={dropdownBarRef} className="mb-2 flex flex-wrap items-center gap-1.5 pb-1">
        {/* Presets Dropdown */}
        <div className="relative">
          <DropdownButton
            label={activePreset ? `${PRESETS.find(p => p.id === activePreset)?.icon} ${PRESETS.find(p => p.id === activePreset)?.label}` : "Preset Filters"}
            isActive={activePreset !== null}
            isOpen={openDropdown === "presets"}
            onClick={() => setOpenDropdown(openDropdown === "presets" ? null : "presets")}
          />
          {openDropdown === "presets" && (
            <div className="absolute top-full left-0 mt-1 min-w-[280px] bg-bg-tertiary border border-border-subtle rounded-xl p-2 z-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              <button
                onClick={() => {
                  clearAllFilters();
                  setOpenDropdown(null);
                }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors",
                  !hasActiveFilters
                    ? "bg-accent/15 text-accent"
                    : "hover:bg-bg-secondary text-text-primary"
                )}
              >
                <span className="text-base">🔄</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">None (show all)</div>
                  <div className="text-[11px] text-text-muted">No filters, ranked by market cap</div>
                </div>
                {!hasActiveFilters && <span className="ml-auto text-accent">✓</span>}
              </button>
              <div className="border-t border-border-subtle my-1" />
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    if (activePreset === preset.id) {
                      clearAllFilters();
                    } else {
                      applyPreset(preset);
                    }
                    setOpenDropdown(null);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors",
                    activePreset === preset.id
                      ? "bg-accent/15 text-accent"
                      : "hover:bg-bg-secondary text-text-primary"
                  )}
                >
                  <span className="text-base">{preset.icon}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{preset.label}</div>
                    <div className="text-[11px] text-text-muted">{preset.subtitle}</div>
                  </div>
                  {activePreset === preset.id && <span className="ml-auto text-accent">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-border-subtle mx-1" />

        {/* Single Filters Dropdown */}
        <div className="relative">
          <DropdownButton
            label="Custom Filters"
            isActive={hasActiveFilters}
            isOpen={openDropdown === "filters"}
            onClick={() => setOpenDropdown(openDropdown === "filters" ? null : "filters")}
            badge={activeFilterCount}
          />
          {openDropdown === "filters" && (
            <div className="absolute top-full left-0 mt-1 bg-bg-tertiary border border-border-subtle rounded-xl p-4 z-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)] w-[680px]">
              <div className="grid grid-cols-4 gap-3">
                <FilterGridInput label="Market Cap ($B)" minKey="minMarketCap" maxKey="maxMarketCap" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="P/E Ratio" minKey="minPERatio" maxKey="maxPERatio" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Forward P/E" minKey="minForwardPE" maxKey="maxForwardPE" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Earnings TTM ($B)" minKey="minEarnings" maxKey="maxEarnings" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Revenue TTM ($B)" minKey="minRevenue" maxKey="maxRevenue" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Op. Margin (%)" minKey="minOperatingMargin" maxKey="maxOperatingMargin" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Div. Yield (%)" minKey="minDividend" maxKey="maxDividend" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="% to 52W High" minKey="minPctTo52WeekHigh" maxKey="maxPctTo52WeekHigh" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Rev CAGR 5Y (%)" minKey="minRevenueGrowth" maxKey="maxRevenueGrowth" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Rev CAGR 3Y (%)" minKey="minRevenueGrowth3Y" maxKey="maxRevenueGrowth3Y" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="EPS CAGR 5Y (%)" minKey="minEPSGrowth" maxKey="maxEPSGrowth" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="EPS CAGR 3Y (%)" minKey="minEPSGrowth3Y" maxKey="maxEPSGrowth3Y" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <div>
                  <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1">Country</label>
                  <select
                    value={pendingFilters.country}
                    onChange={(e) => updateFilter("country", e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-bg-secondary border border-border-subtle rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">All Countries</option>
                    {countries.map((c) => (
                      <option key={c} value={c}>{formatCountry(c)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-3">
                {hasActiveFilters && (
                  <button
                    onClick={clearFiltersAndClose}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-bg-secondary border border-border-subtle rounded-md hover:bg-bg-hover hover:text-text-primary transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={applyFiltersAndClose}
                  disabled={!hasUnappliedChanges}
                  className={cn(
                    "px-4 py-1.5 text-xs font-semibold rounded-md transition-colors",
                    hasUnappliedChanges
                      ? "bg-accent text-white hover:bg-accent-hover"
                      : "bg-bg-secondary text-text-muted cursor-not-allowed"
                  )}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-border-subtle mx-1" />

        {/* Columns Dropdown */}
        <div className="relative">
          <DropdownButton
            label={`Columns (${visibleColumns.size}/${COLUMN_OPTIONS.length})`}
            isActive={false}
            isOpen={openDropdown === "columns"}
            onClick={() => setOpenDropdown(openDropdown === "columns" ? null : "columns")}
          />
          {openDropdown === "columns" && (
            <div className="absolute top-full left-0 mt-1 min-w-[260px] bg-bg-tertiary border border-border-subtle rounded-xl p-2.5 z-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              <div className="grid grid-cols-2 gap-0.5">
                {COLUMN_OPTIONS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-bg-secondary text-[12px] text-text-secondary select-none">
                    <input
                      type="checkbox"
                      checked={isColumnVisible(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="accent-accent w-3 h-3"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        ref={tableScrollRef}
        data-testid="companies-table-scroll"
        className="overflow-auto max-h-[75vh] bg-bg-secondary border border-border-subtle rounded-2xl shadow-lg"
      >
        <table className="min-w-full">
          <thead className="bg-bg-tertiary sticky top-0 z-10 border-b border-border-subtle">
            <tr>
              {isColumnVisible("rank") && (
              <th
                onClick={() => handleSort("rank")}
                className={cn(
                  "px-4 py-4 text-left text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("rank") && "sorted-column-header"
                )}
              >
                # <SortIndicator columnKey="rank" />
              </th>
              )}
              {isColumnVisible("name") && (
              <th
                onClick={() => handleSort("name")}
                className={cn(
                  "px-4 py-4 text-left text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors max-w-[242px]",
                  isSortedColumn("name") && "sorted-column-header"
                )}
              >
                Name <SortIndicator columnKey="name" />
              </th>
              )}
              {isColumnVisible("country") && (
              <th
                onClick={() => handleSort("country")}
                className={cn(
                  "px-4 py-4 text-left text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("country") && "sorted-column-header"
                )}
              >
                Country <SortIndicator columnKey="country" />
              </th>
              )}
              {isColumnVisible("marketCap") && (
              <th
                onClick={() => handleSort("marketCap")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("marketCap") && "sorted-column-header"
                )}
              >
                Market Cap <SortIndicator columnKey="marketCap" />
              </th>
              )}
              {isColumnVisible("price") && (
              <th
                onClick={() => handleSort("price")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("price") && "sorted-column-header"
                )}
              >
                Price <SortIndicator columnKey="price" />
              </th>
              )}
              {isColumnVisible("dailyChangePercent") && (
              <th
                onClick={() => handleSort("dailyChangePercent")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("dailyChangePercent") && "sorted-column-header"
                )}
              >
                Today <SortIndicator columnKey="dailyChangePercent" />
              </th>
              )}
              {isColumnVisible("pctTo52WeekHigh") && (
              <th
                onClick={() => handleSort("pctTo52WeekHigh")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("pctTo52WeekHigh") && "sorted-column-header"
                )}
              >
                % to 52W High <SortIndicator columnKey="pctTo52WeekHigh" />
              </th>
              )}
              {isColumnVisible("earnings") && (
              <th
                onClick={() => handleSort("earnings")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("earnings") && "sorted-column-header"
                )}
              >
                Earnings <SortIndicator columnKey="earnings" />
              </th>
              )}
              {isColumnVisible("revenue") && (
              <th
                onClick={() => handleSort("revenue")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("revenue") && "sorted-column-header"
                )}
              >
                Revenue <SortIndicator columnKey="revenue" />
              </th>
              )}
              {isColumnVisible("peRatio") && (
              <th
                onClick={() => handleSort("peRatio")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("peRatio") && "sorted-column-header"
                )}
              >
                P/E <SortIndicator columnKey="peRatio" />
              </th>
              )}
              {isColumnVisible("forwardPE") && (
              <th
                onClick={() => handleSort("forwardPE")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("forwardPE") && "sorted-column-header"
                )}
              >
                Fwd P/E <SortIndicator columnKey="forwardPE" />
              </th>
              )}
              {isColumnVisible("dividendPercent") && (
              <th
                onClick={() => handleSort("dividendPercent")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("dividendPercent") && "sorted-column-header"
                )}
              >
                Div % <SortIndicator columnKey="dividendPercent" />
              </th>
              )}
              {isColumnVisible("operatingMargin") && (
              <th
                onClick={() => handleSort("operatingMargin")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("operatingMargin") && "sorted-column-header"
                )}
              >
                Op. Margin % <SortIndicator columnKey="operatingMargin" />
              </th>
              )}
              {isColumnVisible("revenueGrowth5Y") && (
              <th
                onClick={() => handleSort("revenueGrowth5Y")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("revenueGrowth5Y") && "sorted-column-header"
                )}
              >
                Rev CAGR 5Y <SortIndicator columnKey="revenueGrowth5Y" />
              </th>
              )}
              {isColumnVisible("revenueGrowth3Y") && (
              <th
                onClick={() => handleSort("revenueGrowth3Y")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("revenueGrowth3Y") && "sorted-column-header"
                )}
              >
                Rev CAGR 3Y <SortIndicator columnKey="revenueGrowth3Y" />
              </th>
              )}
              {isColumnVisible("epsGrowth5Y") && (
              <th
                onClick={() => handleSort("epsGrowth5Y")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("epsGrowth5Y") && "sorted-column-header"
                )}
              >
                EPS CAGR 5Y <SortIndicator columnKey="epsGrowth5Y" />
              </th>
              )}
              {isColumnVisible("epsGrowth3Y") && (
              <th
                onClick={() => handleSort("epsGrowth3Y")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("epsGrowth3Y") && "sorted-column-header"
                )}
              >
                EPS CAGR 3Y <SortIndicator columnKey="epsGrowth3Y" />
              </th>
              )}
              {isColumnVisible("revenueAnnual") && (
              <th className="px-4 py-4 text-center text-sm font-semibold text-text-secondary uppercase tracking-wider">
                10Y Rev Trend
              </th>
              )}
              {isColumnVisible("epsAnnual") && (
              <th className="px-4 py-4 text-center text-sm font-semibold text-text-secondary uppercase tracking-wider">
                10Y EPS Trend
              </th>
              )}
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
                {isColumnVisible("rank") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap",
                  isSortedColumn("rank") && "sorted-column-cell"
                )}>
                  <span className="text-sm text-text-primary tabular-nums">{company.rank}</span>
                </td>
                )}
                {isColumnVisible("name") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap max-w-[242px]",
                  isSortedColumn("name") && "sorted-column-cell"
                )}>
                  <div className="flex items-center gap-2">
                    <CompanyLogo symbol={company.symbol} name={company.name} />
                    <div className="min-w-0 overflow-hidden">
                      <a
                          href={`https://finance.yahoo.com/quote/${company.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-base font-medium text-text-primary truncate block group-hover:text-accent transition-colors hover:underline"
                        >
                          {company.name}
                        </a>
                      <div className="text-sm text-text-muted">{company.symbol}</div>
                    </div>
                  </div>
                </td>
                )}
                {isColumnVisible("country") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-sm text-text-secondary",
                  isSortedColumn("country") && "sorted-column-cell"
                )}>
                  {formatCountry(company.country)}
                </td>
                )}
                {isColumnVisible("marketCap") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-primary font-semibold",
                  isSortedColumn("marketCap") && "sorted-column-cell"
                )}>
                  {formatMarketCap(company.marketCap)}
                </td>
                )}
                {isColumnVisible("price") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-primary",
                  isSortedColumn("price") && "sorted-column-cell"
                )}>
                  {formatPrice(company.price)}
                </td>
                )}
                {isColumnVisible("dailyChangePercent") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right",
                  isSortedColumn("dailyChangePercent") && "sorted-column-cell"
                )}>
                  <DailyChange value={company.dailyChangePercent} />
                </td>
                )}
                {isColumnVisible("pctTo52WeekHigh") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("pctTo52WeekHigh") && "sorted-column-cell"
                )}>
                  {formatPercent(company.pctTo52WeekHigh, true)}
                </td>
                )}
                {isColumnVisible("earnings") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("earnings") && "sorted-column-cell"
                )}>
                  {formatMarketCap(company.earnings)}
                </td>
                )}
                {isColumnVisible("revenue") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("revenue") && "sorted-column-cell"
                )}>
                  {formatMarketCap(company.revenue)}
                </td>
                )}
                {isColumnVisible("peRatio") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("peRatio") && "sorted-column-cell"
                )}>
                  {formatPERatio(company.peRatio)}
                </td>
                )}
                {isColumnVisible("forwardPE") && (
                <td
                  className={cn(
                    "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                    isSortedColumn("forwardPE") && "sorted-column-cell"
                  )}
                  title={company.forwardEPSDate ? `FY ending ${company.forwardEPSDate}` : undefined}
                >
                  {formatPERatio(company.forwardPE)}
                </td>
                )}
                {isColumnVisible("dividendPercent") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("dividendPercent") && "sorted-column-cell"
                )}>
                  {formatPercent(company.dividendPercent !== null ? company.dividendPercent * 100 : null)}
                </td>
                )}
                {isColumnVisible("operatingMargin") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("operatingMargin") && "sorted-column-cell"
                )}>
                  {formatPercent(company.operatingMargin !== null ? company.operatingMargin * 100 : null)}
                </td>
                )}
                {isColumnVisible("revenueGrowth5Y") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("revenueGrowth5Y") && "sorted-column-cell"
                )}>
                  {formatCAGR(company.revenueGrowth5Y)}
                </td>
                )}
                {isColumnVisible("revenueGrowth3Y") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("revenueGrowth3Y") && "sorted-column-cell"
                )}>
                  {formatCAGR(company.revenueGrowth3Y)}
                </td>
                )}
                {isColumnVisible("epsGrowth5Y") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("epsGrowth5Y") && "sorted-column-cell"
                )}>
                  {formatCAGR(company.epsGrowth5Y)}
                </td>
                )}
                {isColumnVisible("epsGrowth3Y") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("epsGrowth3Y") && "sorted-column-cell"
                )}>
                  {formatCAGR(company.epsGrowth3Y)}
                </td>
                )}
                {isColumnVisible("revenueAnnual") && (
                <td className="px-4 py-3.5 whitespace-nowrap text-center">
                  <RevenueSparkline values={company.revenueAnnual} />
                </td>
                )}
                {isColumnVisible("epsAnnual") && (
                <td className="px-4 py-3.5 whitespace-nowrap text-center">
                  <EpsSparkline values={company.epsAnnual} />
                </td>
                )}
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
