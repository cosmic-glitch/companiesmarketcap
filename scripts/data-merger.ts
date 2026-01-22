import { parse } from "csv-parse/sync";
import { Company } from "../lib/types";
import { parseCSVWithMalformedQuotes, csvToObjects } from "../lib/csv-parser";

// Strip quotes from a string value
function stripQuotes(value: any): any {
  if (typeof value === 'string') {
    return value.replace(/^"+|"+$/g, ''); // Remove leading/trailing quotes
  }
  return value;
}

// Clean record by stripping quotes from all string fields
function cleanRecord(record: any): any {
  const cleaned: any = {};
  for (const key in record) {
    const cleanKey = stripQuotes(key);
    cleaned[cleanKey] = stripQuotes(record[key]);
  }
  return cleaned;
}

// Parse numeric value from CSV (handles $, commas, B, M, T suffixes)
function parseNumericValue(value: string | undefined): number | null {
  if (!value || value === "-" || value === "N/A") {
    return null;
  }

  // Remove $, commas, and spaces
  let cleaned = value.replace(/[$,\s]/g, "");

  // Handle suffixes (T, B, M)
  let multiplier = 1;
  if (cleaned.endsWith("T")) {
    multiplier = 1_000_000_000_000;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith("B")) {
    multiplier = 1_000_000_000;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith("M")) {
    multiplier = 1_000_000;
    cleaned = cleaned.slice(0, -1);
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num * multiplier;
}

// Parse percentage value
function parsePercentage(value: string | undefined): number | null {
  if (!value || value === "-" || value === "N/A") {
    return null;
  }

  const cleaned = value.replace(/%/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Normalize ticker symbol
function normalizeSymbol(symbol: string | undefined): string {
  if (!symbol) return "";
  return symbol.trim().toUpperCase();
}

// Parse market cap CSV (base data)
export function parseMarketCapCSV(csvData: string): Map<string, Partial<Company>> {
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as any[];
  

  const companies = new Map<string, Partial<Company>>();

  for (const record of records) {
    const symbol = normalizeSymbol(record.Symbol);

    if (!symbol) continue;

    companies.set(symbol, {
      symbol,
      name: record.Name,
      rank: parseInt(record.Rank) || 0,
      marketCap: parseNumericValue(record.marketcap),
      price: parseFloat(record["price (USD)"]) || null,
      country: record.country || "United States",
    });
  }

  return companies;
}

// Parse earnings CSV
export function parseEarningsCSV(csvData: string): Map<string, number | null> {
  try {
    // Use standard csv-parse with quote character disabled for better compatibility with malformed CSVs
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      quote: false,  // Disable quote processing - treat quotes as regular characters
      relax_column_count: true,
    }) as any[];

    console.log(`\n📊 Parsed ${records.length} records from earnings CSV`);

    const earnings = new Map<string, number | null>();

    for (let i = 0; i < records.length; i++) {
      const record = cleanRecord(records[i]);
      const symbol = normalizeSymbol(record.Symbol);
      const country = record.country || "";

      // Filter for US companies only
      if (symbol && country.includes("United States")) {
        earnings.set(symbol, parseNumericValue(record.earnings_ttm));
      }
    }

    return earnings;
  } catch (error: any) {
    console.error("Error parsing earnings CSV:", error.message);
    console.log("Attempting to continue with empty earnings data...");
    return new Map();
  }
}

// Parse revenue CSV
export function parseRevenueCSV(csvData: string): Map<string, number | null> {
  try {
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      quote: false,
      relax_column_count: true,
    }) as any[];

    const revenue = new Map<string, number | null>();

    for (const rawRecord of records) {
      const record = cleanRecord(rawRecord);
      const symbol = normalizeSymbol(record.Symbol);
      const country = record.country || "";

      // Filter for US companies only
      if (symbol && country.includes("United States")) {
        revenue.set(symbol, parseNumericValue(record.revenue_ttm));
      }
    }

    return revenue;
  } catch (error: any) {
    console.error("Error parsing revenue CSV:", error.message);
    console.log("Attempting to continue with empty revenue data...");
    return new Map();
  }
}

// Parse P/E ratio CSV
export function parsePERatioCSV(csvData: string): Map<string, number | null> {
  try {
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      quote: false,
      relax_column_count: true,
    }) as any[];

    const peRatios = new Map<string, number | null>();

    for (const rawRecord of records) {
      const record = cleanRecord(rawRecord);
      const symbol = normalizeSymbol(record.Symbol);
      const country = record.country || "";

      // Filter for US companies only
      if (symbol && country.includes("United States")) {
        const peValue = record.pe_ratio_ttm;
        peRatios.set(symbol, parseFloat(peValue) || null);
      }
    }

    return peRatios;
  } catch (error: any) {
    console.error("Error parsing P/E ratio CSV:", error.message);
    console.log("Attempting to continue with empty P/E ratio data...");
    return new Map();
  }
}

// Parse dividend yield CSV
export function parseDividendCSV(csvData: string): Map<string, number | null> {
  try {
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      quote: false,
      relax_column_count: true,
    }) as any[];

    const dividends = new Map<string, number | null>();

    for (const rawRecord of records) {
      const record = cleanRecord(rawRecord);
      const symbol = normalizeSymbol(record.Symbol);
      const country = record.country || "";

      // Filter for US companies only
      if (symbol && country.includes("United States")) {
        const percentValue = parsePercentage(record.dividend_yield_ttm);
        // Divide by 100 because CSV values are already in percentage points (e.g., 40.08 = 0.4008%)
        dividends.set(symbol, percentValue !== null ? percentValue / 100 : null);
      }
    }

    return dividends;
  } catch (error: any) {
    console.error("Error parsing dividend CSV:", error.message);
    console.log("Attempting to continue with empty dividend data...");
    return new Map();
  }
}

// Parse operating margin CSV
export function parseOperatingMarginCSV(csvData: string): Map<string, number | null> {
  try {
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      quote: false,
      relax_column_count: true,
    }) as any[];

    const margins = new Map<string, number | null>();

    for (const rawRecord of records) {
      const record = cleanRecord(rawRecord);
      const symbol = normalizeSymbol(record.Symbol);
      const country = record.country || "";

      // Filter for US companies only
      if (symbol && country.includes("United States")) {
        const percentValue = parsePercentage(record.operating_margin_ttm);
        // Divide by 100 because CSV values are already in percentage points (e.g., 4344 = 43.44%)
        margins.set(symbol, percentValue !== null ? percentValue / 100 : null);
      }
    }

    return margins;
  } catch (error: any) {
    console.error("Error parsing operating margin CSV:", error.message);
    console.log("Attempting to continue with empty operating margin data...");
    return new Map();
  }
}

// Merge all CSV data into unified company objects
export function mergeCSVData(csvDataMap: Map<string, string>): Array<Partial<Company> & { symbol: string }> {
  console.log("\n=== Merging CSV Data ===\n");

  // Parse all CSVs
  const baseCompanies = csvDataMap.has("marketcap")
    ? parseMarketCapCSV(csvDataMap.get("marketcap")!)
    : new Map();

  const earnings = csvDataMap.has("earnings")
    ? parseEarningsCSV(csvDataMap.get("earnings")!)
    : new Map();

  const revenue = csvDataMap.has("revenue")
    ? parseRevenueCSV(csvDataMap.get("revenue")!)
    : new Map();

  const peRatios = csvDataMap.has("pe_ratio")
    ? parsePERatioCSV(csvDataMap.get("pe_ratio")!)
    : new Map();

  const dividends = csvDataMap.has("dividend")
    ? parseDividendCSV(csvDataMap.get("dividend")!)
    : new Map();

  const margins = csvDataMap.has("operating_margin")
    ? parseOperatingMarginCSV(csvDataMap.get("operating_margin")!)
    : new Map();

  console.log(`Base companies (market cap): ${baseCompanies.size}`);
  console.log(`Companies with earnings data: ${earnings.size}`);
  console.log(`Companies with revenue data: ${revenue.size}`);
  console.log(`Companies with P/E ratio data: ${peRatios.size}`);
  console.log(`Companies with dividend data: ${dividends.size}`);
  console.log(`Companies with operating margin data: ${margins.size}`);

  // Merge data using ticker symbol as key
  const mergedCompanies: Array<Partial<Company> & { symbol: string }> = [];

  for (const [symbol, company] of baseCompanies) {
    const merged = {
      ...company,
      symbol,
      earnings: earnings.get(symbol) ?? null,
      revenue: revenue.get(symbol) ?? null,
      peRatio: peRatios.get(symbol) ?? null,
      dividendPercent: dividends.get(symbol) ?? null,
      operatingMargin: margins.get(symbol) ?? null,
    };

    mergedCompanies.push(merged);
  }

  // Count how many companies have each metric
  const stats = {
    total: mergedCompanies.length,
    withEarnings: mergedCompanies.filter((c) => c.earnings !== null).length,
    withRevenue: mergedCompanies.filter((c) => c.revenue !== null).length,
    withPERatio: mergedCompanies.filter((c) => c.peRatio !== null).length,
    withDividend: mergedCompanies.filter((c) => c.dividendPercent !== null).length,
    withMargin: mergedCompanies.filter((c) => c.operatingMargin !== null).length,
  };

  console.log("\n=== Merge Statistics ===");
  console.log(`Total companies: ${stats.total}`);
  console.log(`With earnings: ${stats.withEarnings} (${Math.round((stats.withEarnings / stats.total) * 100)}%)`);
  console.log(`With revenue: ${stats.withRevenue} (${Math.round((stats.withRevenue / stats.total) * 100)}%)`);
  console.log(`With P/E ratio: ${stats.withPERatio} (${Math.round((stats.withPERatio / stats.total) * 100)}%)`);
  console.log(`With dividend: ${stats.withDividend} (${Math.round((stats.withDividend / stats.total) * 100)}%)`);
  console.log(`With margin: ${stats.withMargin} (${Math.round((stats.withMargin / stats.total) * 100)}%)`);

  return mergedCompanies;
}
