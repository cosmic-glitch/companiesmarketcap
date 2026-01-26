/**
 * FMP Data Fetcher
 *
 * Fetches growth metrics and forward PE from Financial Modeling Prep API
 * for all companies and uploads to Vercel Blob.
 *
 * Run with: npm run fetch-fmp
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { FMPCompanyData, FMPDataStore } from "../lib/types";

// Load from .env.local if present
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const FMP_API_KEY = process.env.FMP_API_KEY || "a2OESdUYu2jWddK8MdJpRZUzT7OdqtrQ";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BASE_URL = "https://financialmodelingprep.com/stable";

interface FMPGrowthResponse {
  symbol: string;
  fiveYRevenueGrowthPerShare?: number;
  fiveYNetIncomeGrowthPerShare?: number;
}

interface FMPProfileResponse {
  symbol: string;
  price: number;
}

interface FMPEstimateResponse {
  symbol: string;
  date: string;
  epsAvg: number;
}

// Convert total 5-year growth to CAGR
// CAGR = (1 + total_growth)^(1/5) - 1
function totalGrowthToCAGR(totalGrowth: number): number {
  if (totalGrowth <= -1) {
    // Can't calculate CAGR for -100% or worse decline
    return -1;
  }
  return Math.pow(1 + totalGrowth, 1 / 5) - 1;
}


// Fetch financial growth data
async function fetchGrowthData(symbol: string): Promise<FMPGrowthResponse | null> {
  try {
    const url = `${BASE_URL}/financial-growth?symbol=${symbol}&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch company profile for current price
async function fetchProfile(symbol: string): Promise<FMPProfileResponse | null> {
  try {
    const url = `${BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch analyst estimates for forward EPS
async function fetchAnalystEstimates(symbol: string): Promise<FMPEstimateResponse | null> {
  try {
    const url = `${BASE_URL}/analyst-estimates?symbol=${symbol}&period=annual&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      // Get the next fiscal year estimate
      const currentYear = new Date().getFullYear();
      const nextYearEstimate = response.data.find((est: FMPEstimateResponse) => {
        const estYear = new Date(est.date).getFullYear();
        return estYear === currentYear + 1 || estYear === currentYear;
      });
      return nextYearEstimate || response.data[0];
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch all FMP data for a single symbol
async function fetchCompanyData(symbol: string): Promise<FMPCompanyData> {
  const result: FMPCompanyData = {
    symbol,
    revenueGrowth5Y: null,
    epsGrowth5Y: null,
    forwardPE: null,
    lastUpdated: new Date().toISOString(),
  };

  // Fetch growth data
  const growthData = await fetchGrowthData(symbol);
  if (growthData) {
    if (growthData.fiveYRevenueGrowthPerShare !== undefined) {
      result.revenueGrowth5Y = totalGrowthToCAGR(growthData.fiveYRevenueGrowthPerShare);
    }
    if (growthData.fiveYNetIncomeGrowthPerShare !== undefined) {
      result.epsGrowth5Y = totalGrowthToCAGR(growthData.fiveYNetIncomeGrowthPerShare);
    }
  }

  // Fetch profile and analyst estimates for forward PE
  const [profile, estimates] = await Promise.all([
    fetchProfile(symbol),
    fetchAnalystEstimates(symbol),
  ]);

  if (profile?.price && estimates?.epsAvg && estimates.epsAvg > 0) {
    result.forwardPE = profile.price / estimates.epsAvg;
  }

  return result;
}

// Main function
async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║              FMP Data Fetcher                              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  if (!BLOB_TOKEN) {
    console.error("Error: BLOB_READ_WRITE_TOKEN not found in environment");
    console.error("Please set it in .env.local or environment variables");
    process.exit(1);
  }

  // Load company symbols from local JSON
  const jsonPath = path.join(process.cwd(), "data", "companies.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("Error: data/companies.json not found");
    console.error("Run 'npm run scrape' first to generate company data");
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const symbols: string[] = jsonData.companies.map((c: any) => c.symbol);

  console.log(`Total companies to fetch: ${symbols.length}\n`);

  const startTime = Date.now();
  const results: Record<string, FMPCompanyData> = {};
  let processed = 0;
  let withGrowth = 0;
  let withForwardPE = 0;
  let errors = 0;

  for (const symbol of symbols) {
    try {
      const data = await fetchCompanyData(symbol);
      results[symbol] = data;

      if (data.revenueGrowth5Y !== null || data.epsGrowth5Y !== null) {
        withGrowth++;
      }
      if (data.forwardPE !== null) {
        withForwardPE++;
      }
    } catch (error) {
      errors++;
      results[symbol] = {
        symbol,
        revenueGrowth5Y: null,
        epsGrowth5Y: null,
        forwardPE: null,
        lastUpdated: new Date().toISOString(),
      };
    }

    processed++;

    // Progress update every 100 companies
    if (processed % 100 === 0 || processed === symbols.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (symbols.length - processed) / rate;
      console.log(
        `Progress: ${processed}/${symbols.length} (${Math.round((processed / symbols.length) * 100)}%) | ` +
          `ETA: ${Math.ceil(remaining / 60)}m | ` +
          `Growth: ${withGrowth} | FwdPE: ${withForwardPE}`
      );
    }
  }

  // Create data store
  const dataStore: FMPDataStore = {
    companies: results,
    lastUpdated: new Date().toISOString(),
  };

  // Upload to Vercel Blob
  console.log("\nUploading to Vercel Blob...");
  try {
    const blob = await put("fmp-data.json", JSON.stringify(dataStore), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: BLOB_TOKEN,
    });

    console.log(`✓ Uploaded to: ${blob.url}`);
  } catch (error: any) {
    console.error("Failed to upload to Vercel Blob:", error.message);

    // Save locally as fallback
    const localPath = path.join(process.cwd(), "data", "fmp-data.json");
    fs.writeFileSync(localPath, JSON.stringify(dataStore, null, 2));
    console.log(`Saved locally to: ${localPath}`);
  }

  // Summary
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                      Summary                               ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  console.log(`Total companies:      ${processed}`);
  console.log(`With growth data:     ${withGrowth} (${Math.round((withGrowth / processed) * 100)}%)`);
  console.log(`With forward PE:      ${withForwardPE} (${Math.round((withForwardPE / processed) * 100)}%)`);
  console.log(`Errors:               ${errors}`);
  console.log(`Total time:           ${totalTime} minutes`);
  console.log(`\n✓ FMP data fetch complete!\n`);
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
