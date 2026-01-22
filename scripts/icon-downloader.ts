import axios from "axios";
import fs from "fs";
import path from "path";
import { getDatabase } from "../lib/db";

const LOGO_BASE_URL = "https://companiesmarketcap.com/img/company-logos/64";
const LOGOS_DIR = path.join(process.cwd(), "public", "logos");
const CONCURRENCY = 5;
const MAX_RETRIES = 3;

interface DownloadResult {
  symbol: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
}

// Get all company symbols from database
function getSymbolsFromDatabase(): string[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT symbol FROM companies ORDER BY rank").all() as { symbol: string }[];
  db.close();
  return rows.map((row) => row.symbol);
}

// Download single icon with retry logic
async function downloadIcon(symbol: string, skipExisting: boolean): Promise<DownloadResult> {
  const filePath = path.join(LOGOS_DIR, `${symbol}.webp`);

  // Skip if file already exists and skipExisting is true
  if (skipExisting && fs.existsSync(filePath)) {
    return { symbol, success: true, skipped: true };
  }

  const url = `${LOGO_BASE_URL}/${symbol}.webp`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CompaniesMarketCapClone/1.0)",
        },
      });

      if (response.status === 200 && response.data) {
        fs.writeFileSync(filePath, response.data);
        return { symbol, success: true };
      }

      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (error: any) {
      // 404 errors - logo doesn't exist, don't retry
      if (error.response?.status === 404) {
        return { symbol, success: false, error: "Logo not found (404)" };
      }

      // Other errors - retry with exponential backoff
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        return { symbol, success: false, error: error.message };
      }
    }
  }

  return { symbol, success: false, error: "Max retries exceeded" };
}

// Process downloads with concurrency control
async function downloadWithConcurrency(
  symbols: string[],
  skipExisting: boolean
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  let index = 0;
  let completed = 0;

  const processNext = async (): Promise<void> => {
    while (index < symbols.length) {
      const currentIndex = index++;
      const symbol = symbols[currentIndex];

      const result = await downloadIcon(symbol, skipExisting);
      results.push(result);
      completed++;

      // Progress update every 50 downloads
      if (completed % 50 === 0 || completed === symbols.length) {
        const percent = Math.round((completed / symbols.length) * 100);
        console.log(`Progress: ${completed}/${symbols.length} (${percent}%)`);
      }
    }
  };

  // Start concurrent workers
  const workers = Array(CONCURRENCY).fill(null).map(() => processNext());
  await Promise.all(workers);

  return results;
}

// Main download function
export async function downloadAllIcons(options: { skipExisting?: boolean } = {}): Promise<void> {
  const { skipExisting = true } = options;

  console.log("\n=== Starting Icon Downloads ===\n");

  // Ensure logos directory exists
  if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
    console.log(`Created directory: ${LOGOS_DIR}`);
  }

  // Get symbols from database
  const symbols = getSymbolsFromDatabase();
  console.log(`Found ${symbols.length} companies in database`);
  console.log(`Skip existing: ${skipExisting}`);
  console.log(`Concurrency: ${CONCURRENCY} parallel downloads\n`);

  // Download icons
  const results = await downloadWithConcurrency(symbols, skipExisting);

  // Summarize results
  const successful = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success);

  console.log("\n=== Download Summary ===");
  console.log(`✓ Downloaded: ${successful.length}`);
  console.log(`⊘ Skipped (existing): ${skipped.length}`);
  console.log(`✗ Failed: ${failed.length}`);

  if (failed.length > 0 && failed.length <= 20) {
    console.log("\nFailed downloads:");
    failed.forEach((r) => console.log(`  - ${r.symbol}: ${r.error}`));
  } else if (failed.length > 20) {
    console.log(`\nFirst 20 failures:`);
    failed.slice(0, 20).forEach((r) => console.log(`  - ${r.symbol}: ${r.error}`));
    console.log(`  ... and ${failed.length - 20} more`);
  }

  console.log(`\nLogos saved to: ${LOGOS_DIR}`);
}

// Run if called directly
if (require.main === module) {
  const skipExisting = !process.argv.includes("--force");

  if (process.argv.includes("--force")) {
    console.log("Force mode: Re-downloading all icons");
  }

  downloadAllIcons({ skipExisting })
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nFatal error:", error.message);
      process.exit(1);
    });
}
