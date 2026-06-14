"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Company, PresetConfig } from "@/lib/types";
import { formatMarketCap, formatPrice, formatPercent, formatPERatio, formatCAGR, cn } from "@/lib/utils";
import { formatCountry } from "@/lib/countries";
import { formatPresetCriteria, formatPresetName, formatPresetSort } from "@/lib/preset-summary";
import { buildFilterDescriptions, sortLabelFor } from "@/lib/filter-summary";
import {
  applyUpdates,
  colKeyFromAlias,
  decodeColumns,
  encodeColumns,
  hasAliased,
  readAliased,
} from "@/lib/url-aliases";
import SavePresetModal from "./SavePresetModal";
import FeedbackWidget from "./FeedbackWidget";

const PRESETS: PresetConfig[] = [
  {
    id: 'mega-cap-value',
    label: 'Mega Cap Value',
    icon: '🏦',
    filters: { minMarketCap: '500', maxForwardPE: '25' },
    sort: { sortBy: 'forwardPE', sortOrder: 'asc' },
  },
  {
    id: 'garp',
    label: 'Great Price for Reasonable Growth',
    icon: '📈',
    filters: { minMarketCap: '100', maxForwardPE: '15', minOperatingMargin: '20', minRevenueGrowth3Y: '10', minEPSGrowth3Y: '10' },
    sort: { sortBy: 'forwardPE', sortOrder: 'asc' },
  },
  {
    id: 'reliable-dividends',
    label: 'Reliable Dividend Generators',
    icon: '💰',
    filters: { minMarketCap: '10', minDividend: '6', minRevenueGrowth: '5', minEPSGrowth: '5' },
    sort: { sortBy: 'dividendPercent', sortOrder: 'desc' },
  },
];

const LOGO_BASE_URL = "https://companiesmarketcap.com/img/company-logos/64";
const LOGO_SYMBOL_ALIASES: Record<string, string> = {
  GOOGL: "GOOG",
  "BRK-A": "BRK-B",
};

function getLogoSymbol(symbol: string): string {
  return LOGO_SYMBOL_ALIASES[symbol] ?? symbol;
}

// Company logo component with fallback
function CompanyLogo({ symbol, name }: { symbol: string; name: string }) {
  const [error, setError] = useState(false);
  const logoSymbol = getLogoSymbol(symbol);

  useEffect(() => {
    setError(false);
  }, [logoSymbol]);

  if (error) {
    return (
      <div className="w-8 h-8 bg-bg-tertiary rounded flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0">
        {name.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      src={`${LOGO_BASE_URL}/${encodeURIComponent(logoSymbol)}.webp`}
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

// Some source rows carry a duplicate fiscal year (e.g. a company that changed
// its fiscal-year-end reports two periods landing in the same calendar year).
// That would draw a redundant bar and collide React keys, so keep one entry
// per year — the first in newest-first storage order.
function dedupeByYear<T extends { year: number }>(values: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const v of values) {
    if (seen.has(v.year)) continue;
    seen.add(v.year);
    out.push(v);
  }
  return out;
}

// Inline SVG bar chart showing annual revenue trend.
// Storage order is newest-first; render oldest→newest (left→right).
function RevenueSparkline({ values }: { values: { year: number; revenue: number }[] | null }) {
  if (!values || values.length < 2) {
    return <span className="text-text-muted">-</span>;
  }

  const ordered = dedupeByYear(values).reverse();
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
            fill="#64748b"
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

  const ordered = dedupeByYear(values).reverse();
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
              fill="#64748b"
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
            fill="rgba(220, 38, 38, 0.9)"
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
  total: number;
  sortBy: keyof Company;
  sortOrder: "asc" | "desc";
  countries: string[];
  sectors: string[];
  industries: string[];
  userPresets: PresetConfig[];
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
  minForwardEPSGrowth: string;
  maxForwardEPSGrowth: string;
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
  minFreeCashFlow: string;
  maxFreeCashFlow: string;
  minNetDebt: string;
  maxNetDebt: string;
  country: string;
  sector: string;
  industry: string;
}

const FILTER_KEYS: (keyof FilterState)[] = [
  "minMarketCap", "maxMarketCap",
  "minEarnings", "maxEarnings",
  "minRevenue", "maxRevenue",
  "minPERatio", "maxPERatio",
  "minForwardPE", "maxForwardPE",
  "minForwardEPSGrowth", "maxForwardEPSGrowth",
  "minDividend", "maxDividend",
  "minOperatingMargin", "maxOperatingMargin",
  "minRevenueGrowth", "maxRevenueGrowth",
  "minRevenueGrowth3Y", "maxRevenueGrowth3Y",
  "minEPSGrowth", "maxEPSGrowth",
  "minEPSGrowth3Y", "maxEPSGrowth3Y",
  "minPctTo52WeekHigh", "maxPctTo52WeekHigh",
  "minFreeCashFlow", "maxFreeCashFlow",
  "minNetDebt", "maxNetDebt",
  "country",
  "sector",
  "industry",
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
      "flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[9px] border transition-colors whitespace-nowrap",
      isActive
        ? "bg-accent/15 border-accent/40 text-accent"
        : "bg-bg-tertiary border-border-strong text-text-secondary hover:border-accent/50 hover:text-text-primary"
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
  // Every column defaults to visible except Country and Industry.
  { key: "country", label: "Country", defaultVisible: false },
  { key: "sector", label: "Sector", defaultVisible: true },
  { key: "industry", label: "Industry", defaultVisible: false },
  { key: "marketCap", label: "Market Cap", defaultVisible: true },
  { key: "price", label: "Price", defaultVisible: true },
  { key: "dailyChangePercent", label: "Today", defaultVisible: true },
  { key: "revenueAnnual", label: "10Y Rev Trend", defaultVisible: true },
  { key: "epsAnnual", label: "10Y EPS Trend", defaultVisible: true },
  { key: "pctTo52WeekHigh", label: "% to 52W High", defaultVisible: true },
  { key: "earnings", label: "Earnings", defaultVisible: true },
  { key: "revenue", label: "Revenue", defaultVisible: true },
  { key: "freeCashFlow", label: "FCF", defaultVisible: false },
  { key: "peRatio", label: "P/E", defaultVisible: true },
  { key: "forwardPE", label: "Fwd P/E", defaultVisible: true },
  { key: "forwardEPSGrowth", label: "Fwd EPS Growth", defaultVisible: true },
  { key: "dividendPercent", label: "Div Yld", defaultVisible: true },
  { key: "operatingMargin", label: "Op. Margin %", defaultVisible: true },
  { key: "netDebt", label: "Net Debt", defaultVisible: true },
  { key: "revenueGrowth5Y", label: "Rev CAGR 5Y", defaultVisible: true },
  { key: "revenueGrowth3Y", label: "Rev CAGR 3Y", defaultVisible: true },
  { key: "epsGrowth5Y", label: "EPS CAGR 5Y", defaultVisible: true },
  { key: "epsGrowth3Y", label: "EPS CAGR 3Y", defaultVisible: true },
];

const ALWAYS_VISIBLE_COLUMNS = new Set<SortKey>(["rank", "name"]);

const DEFAULT_VISIBLE_COLUMNS = new Set<SortKey>(
  COLUMN_OPTIONS.filter((column) => column.defaultVisible).map((column) => column.key)
);

// Maps each URL filter key to the column it filters. Used to auto-reveal
// hidden columns when a shared URL targets them.
const FILTER_TO_COLUMN: Record<keyof FilterState, SortKey> = {
  minMarketCap: "marketCap", maxMarketCap: "marketCap",
  minEarnings: "earnings", maxEarnings: "earnings",
  minRevenue: "revenue", maxRevenue: "revenue",
  minPERatio: "peRatio", maxPERatio: "peRatio",
  minForwardPE: "forwardPE", maxForwardPE: "forwardPE",
  minForwardEPSGrowth: "forwardEPSGrowth", maxForwardEPSGrowth: "forwardEPSGrowth",
  minDividend: "dividendPercent", maxDividend: "dividendPercent",
  minOperatingMargin: "operatingMargin", maxOperatingMargin: "operatingMargin",
  minRevenueGrowth: "revenueGrowth5Y", maxRevenueGrowth: "revenueGrowth5Y",
  minRevenueGrowth3Y: "revenueGrowth3Y", maxRevenueGrowth3Y: "revenueGrowth3Y",
  minEPSGrowth: "epsGrowth5Y", maxEPSGrowth: "epsGrowth5Y",
  minEPSGrowth3Y: "epsGrowth3Y", maxEPSGrowth3Y: "epsGrowth3Y",
  minPctTo52WeekHigh: "pctTo52WeekHigh", maxPctTo52WeekHigh: "pctTo52WeekHigh",
  minFreeCashFlow: "freeCashFlow", maxFreeCashFlow: "freeCashFlow",
  minNetDebt: "netDebt", maxNetDebt: "netDebt",
  country: "country",
  sector: "sector",
  industry: "industry",
};

type ReadOnlyParams = { has(key: string): boolean; get(key: string): string | null };

// Returns columns that the URL filters or sortBy reference, so callers can
// reveal them. Used both at mount and on URL changes (preset clicks, browser
// back/forward) — we only ever *add* columns, never remove, so manual user
// toggles are preserved.
const getReferencedColumns = (params: ReadOnlyParams): SortKey[] => {
  const cols: SortKey[] = [];
  for (const key of FILTER_KEYS) {
    if (hasAliased(params, key)) cols.push(FILTER_TO_COLUMN[key]);
  }
  const sortByRaw = readAliased(params, 'sortBy');
  const urlSortBy = sortByRaw ? (colKeyFromAlias(sortByRaw) as SortKey) : null;
  if (urlSortBy && COLUMN_OPTIONS.some((c) => c.key === urlSortBy)) {
    cols.push(urlSortBy);
  }
  return cols;
};

export default function CompaniesTable({ companies, total, sortBy: sortByProp, sortOrder: sortOrderProp, countries, sectors, industries, userPresets }: CompaniesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const previousFilterSignatureRef = useRef<string | null>(null);
  const presetsRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  // Optimistic-state trackers reconciled against the prop on every re-sync.
  // The Vercel Blob CDN can serve a stale presets.json for several seconds
  // after a write, so a naive setLocalUserPresets(userPresets) here would
  // clobber a just-added preset or resurrect a just-deleted one. We instead
  // remember locally-pending adds and deletions and merge them with the
  // server's view until the server catches up.
  const pendingPresetAddsRef = useRef<Map<string, PresetConfig>>(new Map());
  const presetTombstonesRef = useRef<Set<string>>(new Set());

  const [localUserPresets, setLocalUserPresets] = useState<PresetConfig[]>(userPresets);
  useEffect(() => {
    const serverIds = new Set(userPresets.map((p) => p.id));
    // Server has caught up to an optimistic add → stop overriding it locally.
    for (const id of [...pendingPresetAddsRef.current.keys()]) {
      if (serverIds.has(id)) pendingPresetAddsRef.current.delete(id);
    }
    // Server has dropped a tombstoned preset → tombstone is no longer needed.
    for (const id of [...presetTombstonesRef.current]) {
      if (!serverIds.has(id)) presetTombstonesRef.current.delete(id);
    }
    const fromServer = userPresets.filter((p) => !presetTombstonesRef.current.has(p.id));
    const extras: PresetConfig[] = [];
    for (const [id, preset] of pendingPresetAddsRef.current) {
      if (!serverIds.has(id)) extras.push(preset);
    }
    setLocalUserPresets([...fromServer, ...extras]);
  }, [userPresets]);

  // Hardcoded defaults appear first so a user-saved preset that happens to
  // duplicate one matches the curated entry and keeps its subtitle.
  const allPresets = useMemo(() => [...PRESETS, ...localUserPresets], [localUserPresets]);

  // Column visibility seeds from the URL's cols= param (if present) or the
  // defaults. Auto-reveal logic below still adds any columns referenced by
  // URL filters/sortBy. Manual toggles are preserved — we only ever add.
  const [visibleColumns, setVisibleColumns] = useState<Set<SortKey>>(() => {
    const fromUrl = decodeColumns(searchParams.get('cols'), DEFAULT_VISIBLE_COLUMNS);
    const initial = new Set<SortKey>(fromUrl as Set<SortKey>);
    for (const col of getReferencedColumns(searchParams)) initial.add(col);
    return initial;
  });

  const toggleColumn = (key: SortKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Sync to URL via replace so column toggles don't pollute history.
      const encoded = encodeColumns(next, DEFAULT_VISIBLE_COLUMNS);
      const params = applyUpdates(searchParams, { cols: encoded ?? undefined });
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : '/');
      return next;
    });
  };

  // Reveal columns that newly-applied URL state references (preset clicks,
  // browser back/forward). Only adds — never removes — so the user's manual
  // hide toggles survive URL changes.
  useEffect(() => {
    const referenced = getReferencedColumns(searchParams);
    if (referenced.length === 0) return;
    setVisibleColumns((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const col of referenced) {
        if (!next.has(col)) {
          next.add(col);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searchParams]);

  // Track sort state locally for immediate UI updates, synced with URL
  const [sortBy, setSortBy] = useState<keyof Company>(() => {
    const raw = readAliased(searchParams, 'sortBy');
    return raw ? (colKeyFromAlias(raw) as keyof Company) : sortByProp;
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    (readAliased(searchParams, 'sortOrder') as 'asc' | 'desc' | null) || sortOrderProp
  );

  // Sync local state when URL changes (e.g., browser back/forward, preset clicks)
  useEffect(() => {
    const raw = readAliased(searchParams, 'sortBy');
    const urlSortBy = raw ? (colKeyFromAlias(raw) as keyof Company) : sortByProp;
    const urlSortOrder = (readAliased(searchParams, 'sortOrder') as 'asc' | 'desc' | null) || sortOrderProp;
    setSortBy(urlSortBy);
    setSortOrder(urlSortOrder);
  }, [searchParams, sortByProp, sortOrderProp]);

  // Close any open dropdown when the user interacts outside all three popovers.
  // Per-popover refs (not a shared bar wrapper) so each dropdown self-detects
  // even if the surrounding layout changes; touchstart covers mobile taps.
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const insideAny =
        presetsRef.current?.contains(target) ||
        filtersRef.current?.contains(target) ||
        columnsRef.current?.contains(target);
      if (!insideAny) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  // Scroll the company list back to the top whenever applied filters change.
  const filterSignature = useMemo(
    () => FILTER_KEYS.map((key) => `${key}:${readAliased(searchParams, key) ?? ""}`).join("|"),
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
    const sortByRaw = readAliased(searchParams, 'sortBy');
    const sortByNormalized = sortByRaw ? colKeyFromAlias(sortByRaw) : null;
    const sortOrderVal = readAliased(searchParams, 'sortOrder');

    for (const preset of allPresets) {
      // Check if all preset filters match
      const allFiltersMatch = Object.entries(preset.filters).every(
        ([key, value]) => readAliased(searchParams, key) === value
      );

      // Check if sort matches (if preset has sort specified)
      const sortMatches = !preset.sort.sortBy ||
        (sortByNormalized === preset.sort.sortBy &&
         sortOrderVal === preset.sort.sortOrder);

      // Also check that there are no extra filters in URL that aren't in preset
      const activeFilterKeys = FILTER_KEYS.filter((key) => hasAliased(searchParams, key));
      const presetFilterKeys = Object.keys(preset.filters);
      const noExtraFilters = activeFilterKeys.length === presetFilterKeys.length;

      if (allFiltersMatch && sortMatches && noExtraFilters) {
        return preset.id;
      }
    }
    return null;
  }, [searchParams, allPresets]);

  // Apply a preset's filters and sort. Preset is a *replacement* for current
  // filters/sort. Columns are replaced only if the preset specifies them
  // (legacy presets without a `columns` array preserve the current cols).
  const applyPreset = useCallback((preset: PresetConfig) => {
    const updates: Record<string, string | undefined> = { page: undefined };

    // Clear all existing filter keys; preset re-adds only its own.
    for (const key of FILTER_KEYS) updates[key] = undefined;
    for (const [key, value] of Object.entries(preset.filters)) updates[key] = value;

    // Sort
    if (preset.sort.sortBy) {
      updates.sortBy = preset.sort.sortBy;
      updates.sortOrder = preset.sort.sortOrder ?? 'desc';
      setSortBy(preset.sort.sortBy as keyof Company);
      setSortOrder(preset.sort.sortOrder ?? 'desc');
    } else {
      updates.sortBy = undefined;
      updates.sortOrder = undefined;
    }

    // Columns: preset wins if specified; otherwise preserve the current URL
    // value so legacy presets don't wipe a user's column selection.
    if (preset.columns && preset.columns.length > 0) {
      const newCols = new Set<SortKey>(preset.columns as SortKey[]);
      setVisibleColumns(newCols);
      const encoded = encodeColumns(newCols, DEFAULT_VISIBLE_COLUMNS);
      updates.cols = encoded ?? undefined;
    } else {
      updates.cols = searchParams.get('cols') ?? undefined;
    }

    const params = applyUpdates(null, updates);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
  }, [router, searchParams]);

  // Clear all filters (when clicking active preset)
  const clearAllFilters = useCallback(() => {
    // Reset to default sort and column visibility immediately for instant
    // visual feedback. URL becomes "/", which has no `cols` either.
    setSortBy(sortByProp);
    setSortOrder(sortOrderProp);
    setVisibleColumns(new Set(DEFAULT_VISIBLE_COLUMNS));
    router.push('/');
  }, [router, sortByProp, sortOrderProp]);

  const handleDeletePreset = useCallback(async (preset: PresetConfig) => {
    if (!window.confirm(`Delete preset "${formatPresetName(preset)}"?`)) return;
    const snapshot = localUserPresets;
    // Tombstone first so a stale RSC re-sync doesn't resurrect this preset.
    presetTombstonesRef.current.add(preset.id);
    pendingPresetAddsRef.current.delete(preset.id);
    setLocalUserPresets((prev) => prev.filter((p) => p.id !== preset.id));
    try {
      const res = await fetch(`/api/presets?id=${encodeURIComponent(preset.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      router.refresh();
    } catch (err) {
      presetTombstonesRef.current.delete(preset.id);
      setLocalUserPresets(snapshot);
      window.alert("Failed to delete preset. Please try again.");
      console.error(err);
    }
  }, [localUserPresets, router]);

  // Initialize pending filters from URL (alias-aware; back-compat with
  // legacy long-form keys).
  const getInitialFilters = useCallback((): FilterState => {
    const get = (key: string) => readAliased(searchParams, key) || "";
    return {
      minMarketCap: get("minMarketCap"),
      maxMarketCap: get("maxMarketCap"),
      minEarnings: get("minEarnings"),
      maxEarnings: get("maxEarnings"),
      minRevenue: get("minRevenue"),
      maxRevenue: get("maxRevenue"),
      minPERatio: get("minPERatio"),
      maxPERatio: get("maxPERatio"),
      minForwardPE: get("minForwardPE"),
      maxForwardPE: get("maxForwardPE"),
      minForwardEPSGrowth: get("minForwardEPSGrowth"),
      maxForwardEPSGrowth: get("maxForwardEPSGrowth"),
      minDividend: get("minDividend"),
      maxDividend: get("maxDividend"),
      minOperatingMargin: get("minOperatingMargin"),
      maxOperatingMargin: get("maxOperatingMargin"),
      minRevenueGrowth: get("minRevenueGrowth"),
      maxRevenueGrowth: get("maxRevenueGrowth"),
      minRevenueGrowth3Y: get("minRevenueGrowth3Y"),
      maxRevenueGrowth3Y: get("maxRevenueGrowth3Y"),
      minEPSGrowth: get("minEPSGrowth"),
      maxEPSGrowth: get("maxEPSGrowth"),
      minEPSGrowth3Y: get("minEPSGrowth3Y"),
      maxEPSGrowth3Y: get("maxEPSGrowth3Y"),
      minPctTo52WeekHigh: get("minPctTo52WeekHigh"),
      maxPctTo52WeekHigh: get("maxPctTo52WeekHigh"),
      minFreeCashFlow: get("minFreeCashFlow"),
      maxFreeCashFlow: get("maxFreeCashFlow"),
      minNetDebt: get("minNetDebt"),
      maxNetDebt: get("maxNetDebt"),
      country: get("country"),
      sector: get("sector"),
      industry: get("industry"),
    };
  }, [searchParams]);

  const [pendingFilters, setPendingFilters] = useState<FilterState>(getInitialFilters);

  // Sync pending filters when URL changes (e.g., when a preset is applied)
  useEffect(() => {
    setPendingFilters(getInitialFilters());
  }, [searchParams, getInitialFilters]);

  // Build URL with parameters. Translates internal keys → URL aliases and
  // carries over existing aliased params.
  const buildUrl = useCallback((updates: Record<string, string | undefined>) => {
    const params = applyUpdates(searchParams, updates);
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

  // Clear all filters (preserves sort; drops cols too so the URL is clean).
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
      minForwardEPSGrowth: "",
      maxForwardEPSGrowth: "",
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
      minFreeCashFlow: "",
      maxFreeCashFlow: "",
      minNetDebt: "",
      maxNetDebt: "",
      country: "",
      sector: "",
      industry: "",
    };
    setPendingFilters(emptyFilters);

    // Build URL preserving only sort. cols= and all filters are dropped.
    const updates: Record<string, string | undefined> = { page: undefined, cols: undefined };
    for (const key of FILTER_KEYS) updates[key] = undefined;
    if (sortBy !== "rank") updates.sortBy = sortBy;
    else updates.sortBy = undefined;
    if (sortOrder !== "asc") updates.sortOrder = sortOrder;
    else updates.sortOrder = undefined;
    const params = applyUpdates(null, updates);
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  // Update pending filter value (doesn't apply filter yet)
  const updateFilter = (key: keyof FilterState, value: string) => {
    setPendingFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Check if any filters are active (in URL)
  const hasActiveFilters = FILTER_KEYS.some((key) => hasAliased(searchParams, key));
  // Anything worth saving — filters, an explicit sort, or a non-default
  // column selection.
  const hasNonDefaultColumns = encodeColumns(visibleColumns, DEFAULT_VISIBLE_COLUMNS) !== null;
  const hasSavableState = hasActiveFilters || hasAliased(searchParams, 'sortBy') || hasNonDefaultColumns;

  // Check if pending filters are different from URL filters
  const currentFilters = getInitialFilters();
  const hasUnappliedChanges = JSON.stringify(pendingFilters) !== JSON.stringify(currentFilters);

  // Count active filters for badge
  const activeFilterCount = FILTER_KEYS.filter((key) => hasAliased(searchParams, key)).length;

  // Read-only labels for the applied-filter summary row above the table.
  // Built from the URL (applied state), alias-aware to match how filters are stored.
  const activeDescriptions = useMemo(
    () => buildFilterDescriptions((key) => readAliased(searchParams, key)),
    [searchParams]
  );

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
      <div className="mb-2 flex flex-wrap items-center gap-1.5 pb-1">
        {/* Presets Dropdown */}
        <div ref={presetsRef} className="relative">
          <DropdownButton
            label={(() => {
              if (!activePreset) return "⚡ Preset Filters";
              const p = allPresets.find(p => p.id === activePreset);
              if (!p) return "⚡ Preset Filters";
              return `${p.icon} ${formatPresetName(p)}`;
            })()}
            isActive={activePreset !== null}
            isOpen={openDropdown === "presets"}
            onClick={() => setOpenDropdown(openDropdown === "presets" ? null : "presets")}
          />
          {openDropdown === "presets" && (
            <div className="absolute top-full left-0 mt-1 min-w-[280px] bg-bg-primary border border-border-subtle rounded-[13px] p-2 z-50 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
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
                    <div className="text-[11px] text-text-muted">{formatPresetCriteria(preset.filters)}</div>
                    <div className="text-[11px] text-text-muted/80">Sorted by {formatPresetSort(preset.sort)}</div>
                  </div>
                  {activePreset === preset.id && <span className="ml-auto text-accent">✓</span>}
                </button>
              ))}
              {localUserPresets.length > 0 && (
                <>
                  <div className="border-t border-border-subtle my-1" />
                  <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    Community
                  </div>
                  {localUserPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className={cn(
                        "flex items-center rounded-lg transition-colors",
                        activePreset === preset.id
                          ? "bg-accent/15 text-accent"
                          : "hover:bg-bg-secondary text-text-primary"
                      )}
                    >
                      <button
                        onClick={() => {
                          if (activePreset === preset.id) {
                            clearAllFilters();
                          } else {
                            applyPreset(preset);
                          }
                          setOpenDropdown(null);
                        }}
                        className="flex flex-1 min-w-0 items-center gap-2.5 px-2.5 py-2 text-left rounded-l-lg"
                      >
                        <span className="text-base">{preset.icon}</span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium truncate">{formatPresetName(preset)}</div>
                          <div className="text-[11px] text-text-muted truncate">{formatPresetCriteria(preset.filters)}</div>
                          <div className="text-[11px] text-text-muted/80 truncate">Sorted by {formatPresetSort(preset.sort)}</div>
                        </div>
                        {activePreset === preset.id && <span className="ml-auto text-accent">✓</span>}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePreset(preset);
                        }}
                        aria-label={`Delete preset ${formatPresetName(preset)}`}
                        title="Delete preset"
                        className="shrink-0 mr-1 p-1.5 rounded-md text-text-muted hover:bg-bg-tertiary hover:text-red-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-border-subtle mx-1" />

        {/* Single Filters Dropdown */}
        <div ref={filtersRef} className="relative">
          <DropdownButton
            label="Custom Filters"
            isActive={hasActiveFilters}
            isOpen={openDropdown === "filters"}
            onClick={() => setOpenDropdown(openDropdown === "filters" ? null : "filters")}
            badge={activeFilterCount}
          />
          {openDropdown === "filters" && (
            <div className="absolute top-full left-0 mt-1 bg-bg-primary border border-border-subtle rounded-[13px] p-4 z-50 shadow-[0_12px_32px_rgba(15,23,42,0.12)] w-[680px]">
              <div className="grid grid-cols-4 gap-3">
                <FilterGridInput label="Market Cap ($B)" minKey="minMarketCap" maxKey="maxMarketCap" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="P/E Ratio" minKey="minPERatio" maxKey="maxPERatio" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Forward P/E" minKey="minForwardPE" maxKey="maxForwardPE" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Fwd EPS Growth (%)" minKey="minForwardEPSGrowth" maxKey="maxForwardEPSGrowth" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Earnings TTM ($B)" minKey="minEarnings" maxKey="maxEarnings" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Revenue TTM ($B)" minKey="minRevenue" maxKey="maxRevenue" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="FCF TTM ($B)" minKey="minFreeCashFlow" maxKey="maxFreeCashFlow" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
                <FilterGridInput label="Net Debt ($B)" minKey="minNetDebt" maxKey="maxNetDebt" pendingFilters={pendingFilters} updateFilter={updateFilter} applyFilters={applyFiltersAndClose} />
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
                <div>
                  <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1">Sector</label>
                  <select
                    value={pendingFilters.sector}
                    onChange={(e) => updateFilter("sector", e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-bg-secondary border border-border-subtle rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">All Sectors</option>
                    {sectors.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1">Industry</label>
                  <select
                    value={pendingFilters.industry}
                    onChange={(e) => updateFilter("industry", e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-bg-secondary border border-border-subtle rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">All Industries</option>
                    {industries.map((i) => (
                      <option key={i} value={i}>{i}</option>
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
        <div ref={columnsRef} className="relative">
          <DropdownButton
            label={`▦ Columns (${visibleColumns.size}/${COLUMN_OPTIONS.length})`}
            isActive={false}
            isOpen={openDropdown === "columns"}
            onClick={() => setOpenDropdown(openDropdown === "columns" ? null : "columns")}
          />
          {openDropdown === "columns" && (
            <div className="absolute top-full left-0 mt-1 min-w-[260px] bg-bg-primary border border-border-subtle rounded-[13px] p-2.5 z-50 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
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

        {hasSavableState && activePreset === null && (
          <>
            <div className="w-px h-5 bg-border-subtle mx-1" />
            <button
              onClick={() => setSavePresetOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border bg-accent/15 border-accent/40 text-accent hover:bg-accent/25 transition-colors whitespace-nowrap"
            >
              💾 Save view
            </button>
          </>
        )}

        {/* Right-aligned via ml-auto on the button itself */}
        <FeedbackWidget />
      </div>

      {/* Applied-filter / sort summary (read-only) */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
        {hasActiveFilters && (
          <span className="font-semibold text-text-primary">
            {total.toLocaleString()} {total === 1 ? "match" : "matches"}
          </span>
        )}
        {activeDescriptions.map((d) => (
          <span
            key={d}
            className="inline-flex items-center px-2 py-0.5 rounded-md bg-bg-tertiary border border-border-subtle text-text-secondary"
          >
            {d}
          </span>
        ))}
        <span className="text-text-muted">
          {hasActiveFilters && <span className="mr-2">·</span>}
          Sorted by {sortLabelFor(sortBy)} {sortOrder === "asc" ? "↑" : "↓"}
        </span>
      </div>

      {/* Table */}
      <div
        ref={tableScrollRef}
        data-testid="companies-table-scroll"
        className="overflow-auto max-h-[75vh] bg-bg-secondary border border-border-subtle rounded-2xl shadow-lg"
      >
        <table className="min-w-full">
          <thead className="bg-bg-tertiary sticky top-0 z-40 border-b border-border-subtle">
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
                  "sticky left-0 z-50 px-4 py-4 text-left text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer transition-colors min-w-[242px] max-w-[242px] shadow-[8px_0_12px_-12px_rgba(0,0,0,0.8)]",
                  isSortedColumn("name")
                    ? "bg-[#d1fae5] hover:bg-[#bbf7d0]"
                    : "bg-bg-tertiary hover:bg-bg-hover"
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
              {isColumnVisible("sector") && (
              <th
                onClick={() => handleSort("sector")}
                className={cn(
                  "px-4 py-4 text-left text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("sector") && "sorted-column-header"
                )}
              >
                Sector <SortIndicator columnKey="sector" />
              </th>
              )}
              {isColumnVisible("industry") && (
              <th
                onClick={() => handleSort("industry")}
                className={cn(
                  "px-4 py-4 text-left text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("industry") && "sorted-column-header"
                )}
              >
                Industry <SortIndicator columnKey="industry" />
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
              {isColumnVisible("freeCashFlow") && (
              <th
                onClick={() => handleSort("freeCashFlow")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("freeCashFlow") && "sorted-column-header"
                )}
              >
                FCF <SortIndicator columnKey="freeCashFlow" />
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
              {isColumnVisible("forwardEPSGrowth") && (
              <th
                onClick={() => handleSort("forwardEPSGrowth")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("forwardEPSGrowth") && "sorted-column-header"
                )}
              >
                Fwd EPS Growth <SortIndicator columnKey="forwardEPSGrowth" />
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
                Div Yld <SortIndicator columnKey="dividendPercent" />
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
              {isColumnVisible("netDebt") && (
              <th
                onClick={() => handleSort("netDebt")}
                className={cn(
                  "px-4 py-4 text-right text-sm font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-bg-hover/50 transition-colors",
                  isSortedColumn("netDebt") && "sorted-column-header"
                )}
              >
                Net Debt <SortIndicator columnKey="netDebt" />
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
                  "sticky left-0 z-20 px-4 py-3.5 whitespace-nowrap min-w-[242px] max-w-[242px] shadow-[8px_0_12px_-12px_rgba(0,0,0,0.8)]",
                  isSortedColumn("name")
                    ? "bg-[#ecfdf5] group-hover:bg-[#d1fae5]"
                    : index % 2 === 0
                      ? "bg-bg-secondary group-hover:bg-bg-hover"
                      : "bg-[#fcfdfe] group-hover:bg-bg-hover"
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
                {isColumnVisible("sector") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-sm text-text-secondary",
                  isSortedColumn("sector") && "sorted-column-cell"
                )}>
                  {company.sector || <span className="text-text-muted">-</span>}
                </td>
                )}
                {isColumnVisible("industry") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-sm text-text-secondary",
                  isSortedColumn("industry") && "sorted-column-cell"
                )}>
                  {company.industry || <span className="text-text-muted">-</span>}
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
                {isColumnVisible("freeCashFlow") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("freeCashFlow") && "sorted-column-cell"
                )}>
                  {formatMarketCap(company.freeCashFlow)}
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
                {isColumnVisible("forwardEPSGrowth") && (
                <td
                  className={cn(
                    "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                    isSortedColumn("forwardEPSGrowth") && "sorted-column-cell"
                  )}
                  title={company.forwardEPSDate ? `FY ending ${company.forwardEPSDate}` : undefined}
                >
                  {formatCAGR(company.forwardEPSGrowth)}
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
                {isColumnVisible("netDebt") && (
                <td className={cn(
                  "px-4 py-3.5 whitespace-nowrap text-base text-right text-text-secondary",
                  isSortedColumn("netDebt") && "sorted-column-cell"
                )}>
                  {formatMarketCap(company.netDebt)}
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

      <SavePresetModal
        isOpen={savePresetOpen}
        onClose={() => setSavePresetOpen(false)}
        currentFilters={Object.fromEntries(
          FILTER_KEYS
            .map((key) => [key, readAliased(searchParams, key)] as const)
            .filter(([, v]) => v !== null && v !== "")
        ) as Record<string, string>}
        currentSort={(() => {
          // Only emit sort if URL explicitly carried one (any aliased form).
          // Local sortBy state always has a fallback to the prop default;
          // we don't want to capture that as part of the saved preset.
          const sortByRaw = readAliased(searchParams, 'sortBy');
          if (!sortByRaw) return {};
          return {
            sortBy: colKeyFromAlias(sortByRaw),
            sortOrder: (readAliased(searchParams, 'sortOrder') as 'asc' | 'desc' | null) ?? undefined,
          };
        })()}
        currentColumns={Array.from(visibleColumns)}
        onSaved={(preset) => {
          // Splice the saved preset into local state so the dropdown updates
          // before the RSC re-fetch lands; remember it so a stale RSC re-sync
          // doesn't drop it. router.refresh() reconciles when the CDN settles.
          pendingPresetAddsRef.current.set(preset.id, preset);
          presetTombstonesRef.current.delete(preset.id);
          setLocalUserPresets((prev) => {
            const idx = prev.findIndex((p) => p.id === preset.id);
            if (idx >= 0) return prev.map((p, i) => (i === idx ? preset : p));
            return [...prev, preset];
          });
          router.refresh();
        }}
      />
    </div>
  );
}
