import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getUserPresets, writeUserPresets } from "@/lib/db";
import { PresetConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALLOWED_FILTER_KEYS = new Set([
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
]);

const ALLOWED_SORT_KEYS = new Set([
  "rank", "name", "country", "marketCap", "price", "dailyChangePercent",
  "pctTo52WeekHigh", "earnings", "revenue", "freeCashFlow", "peRatio",
  "forwardPE", "forwardEPSGrowth", "dividendPercent", "operatingMargin",
  "netDebt", "revenueGrowth5Y", "revenueGrowth3Y", "epsGrowth5Y", "epsGrowth3Y",
]);

// Visible columns can include non-sortable keys (sector/industry filters
// without a sort path; the 10Y trend sparklines).
const ALLOWED_COLUMN_KEYS = new Set([
  ...ALLOWED_SORT_KEYS,
  "sector", "industry", "revenueAnnual", "epsAnnual",
]);

const MAX_LABEL_LEN = 60;
const MAX_ICON_LEN = 8;
const MAX_INITIALS_LEN = 4;
const MAX_FILTER_VALUE_LEN = 64;
const MAX_COLUMNS = 30;
const MAX_TOTAL_PRESETS = 200;

interface SavePresetBody {
  label?: unknown;
  icon?: unknown;
  initials?: unknown;
  filters?: unknown;
  sort?: unknown;
  columns?: unknown;
}

export async function POST(request: NextRequest) {
  let body: SavePresetBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate label
  if (typeof body.label !== "string") {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  const label = body.label.trim();
  if (label.length === 0 || label.length > MAX_LABEL_LEN) {
    return NextResponse.json(
      { error: `label must be 1-${MAX_LABEL_LEN} characters` },
      { status: 400 }
    );
  }

  // Validate icon
  if (typeof body.icon !== "string") {
    return NextResponse.json({ error: "icon is required" }, { status: 400 });
  }
  const icon = body.icon.trim();
  if (icon.length === 0 || icon.length > MAX_ICON_LEN) {
    return NextResponse.json(
      { error: `icon must be 1-${MAX_ICON_LEN} characters` },
      { status: 400 }
    );
  }

  // Validate initials
  if (typeof body.initials !== "string") {
    return NextResponse.json({ error: "initials is required" }, { status: 400 });
  }
  const initials = body.initials.trim();
  if (initials.length === 0 || initials.length > MAX_INITIALS_LEN) {
    return NextResponse.json(
      { error: `initials must be 1-${MAX_INITIALS_LEN} characters` },
      { status: 400 }
    );
  }

  // Validate filters
  if (body.filters === null || typeof body.filters !== "object" || Array.isArray(body.filters)) {
    return NextResponse.json({ error: "filters must be an object" }, { status: 400 });
  }
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.filters as Record<string, unknown>)) {
    if (!ALLOWED_FILTER_KEYS.has(key)) {
      return NextResponse.json({ error: `unknown filter key: ${key}` }, { status: 400 });
    }
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_FILTER_VALUE_LEN) {
      return NextResponse.json(
        { error: `filter ${key} must be a non-empty string up to ${MAX_FILTER_VALUE_LEN} chars` },
        { status: 400 }
      );
    }
    filters[key] = value;
  }

  // Validate sort
  let sort: PresetConfig["sort"] = {};
  if (body.sort !== undefined) {
    if (body.sort === null || typeof body.sort !== "object" || Array.isArray(body.sort)) {
      return NextResponse.json({ error: "sort must be an object" }, { status: 400 });
    }
    const s = body.sort as { sortBy?: unknown; sortOrder?: unknown };
    if (s.sortBy !== undefined) {
      if (typeof s.sortBy !== "string" || !ALLOWED_SORT_KEYS.has(s.sortBy)) {
        return NextResponse.json({ error: "invalid sort.sortBy" }, { status: 400 });
      }
      if (s.sortOrder !== "asc" && s.sortOrder !== "desc") {
        return NextResponse.json({ error: "sort.sortOrder must be 'asc' or 'desc'" }, { status: 400 });
      }
      sort = { sortBy: s.sortBy, sortOrder: s.sortOrder };
    }
  }

  // Validate columns (optional)
  let columns: string[] | undefined;
  if (body.columns !== undefined) {
    if (!Array.isArray(body.columns)) {
      return NextResponse.json({ error: "columns must be an array" }, { status: 400 });
    }
    if (body.columns.length > MAX_COLUMNS) {
      return NextResponse.json(
        { error: `columns must contain at most ${MAX_COLUMNS} entries` },
        { status: 400 }
      );
    }
    const seen = new Set<string>();
    const cols: string[] = [];
    for (const entry of body.columns) {
      if (typeof entry !== "string" || !ALLOWED_COLUMN_KEYS.has(entry)) {
        return NextResponse.json({ error: `unknown column key: ${String(entry)}` }, { status: 400 });
      }
      if (seen.has(entry)) continue;
      seen.add(entry);
      cols.push(entry);
    }
    columns = cols;
  }

  // Reject empty preset (nothing to save)
  if (Object.keys(filters).length === 0 && !sort.sortBy) {
    return NextResponse.json(
      { error: "preset must contain at least one filter or a sort" },
      { status: 400 }
    );
  }

  try {
    const existing = await getUserPresets();
    if (existing.length >= MAX_TOTAL_PRESETS) {
      return NextResponse.json(
        { error: `preset limit reached (${MAX_TOTAL_PRESETS})` },
        { status: 400 }
      );
    }

    const preset: PresetConfig = {
      id: randomUUID(),
      label,
      icon,
      initials,
      filters,
      sort,
      ...(columns !== undefined ? { columns } : {}),
      userCreated: true,
      createdAt: new Date().toISOString(),
    };

    await writeUserPresets([...existing, preset]);
    return NextResponse.json({ preset });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error saving preset:", error);
    return NextResponse.json(
      { error: "Failed to save preset", message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const existing = await getUserPresets();
    const next = existing.filter((p) => p.id !== id);
    // Idempotent: if the id is already gone (cache lag, double-click), succeed
    // with a flag so the client can tell whether anything actually changed.
    if (next.length === existing.length) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    await writeUserPresets(next);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error deleting preset:", error);
    return NextResponse.json(
      { error: "Failed to delete preset", message },
      { status: 500 }
    );
  }
}
