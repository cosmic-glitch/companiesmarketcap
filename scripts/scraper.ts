import { downloadAllCSVs } from "./csv-downloader";
import { mergeCSVData } from "./data-merger";
import {
  initializeDatabase,
  upsertCompanies,
  addPriceHistory,
  calculateDailyChange,
  getCompanyBySymbol,
} from "../lib/db";
import { format } from "date-fns";

async function runScraper() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║  Companies Market Cap Data Scraper    ║");
  console.log("╚════════════════════════════════════════╝\n");

  const startTime = Date.now();

  try {
    // Step 1: Initialize database
    console.log("Step 1: Initializing database...");
    initializeDatabase();
    console.log("✓ Database initialized\n");

    // Step 2: Download all CSV files
    console.log("Step 2: Downloading CSV files...");
    const csvData = await downloadAllCSVs();
    console.log(`✓ Downloaded ${csvData.size} CSV files\n`);

    if (csvData.size === 0) {
      throw new Error("No CSV files downloaded. Cannot proceed.");
    }

    // Step 3: Merge CSV data
    console.log("Step 3: Merging CSV data...");
    const companies = mergeCSVData(csvData);
    console.log(`✓ Merged data for ${companies.length} companies\n`);

    if (companies.length === 0) {
      throw new Error("No companies found after merging. Cannot proceed.");
    }

    // Step 4: Upsert companies to database
    console.log("Step 4: Upserting companies to database...");

    const today = format(new Date(), "yyyy-MM-dd");

    // Calculate daily changes before upserting
    const companiesWithChanges = companies.map((company) => {
      const { symbol, price } = company;
      let dailyChangePercent = null;

      if (symbol && price && price > 0) {
        dailyChangePercent = calculateDailyChange(symbol, price, today);
      }

      return {
        ...company,
        dailyChangePercent,
      };
    });

    // Batch upsert all companies
    upsertCompanies(companiesWithChanges);
    console.log(`✓ Upserted ${companies.length} companies to database\n`);

    // Step 5: Add price history entries
    console.log("Step 5: Adding price history entries...");

    let priceHistoryCount = 0;
    for (const company of companies) {
      const { symbol, price } = company;

      if (symbol && price && price > 0) {
        addPriceHistory(symbol, price, today);
        priceHistoryCount++;
      }
    }

    console.log(`✓ Added ${priceHistoryCount} price history entries\n`);

    // Step 6: Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n╔════════════════════════════════════════╗");
    console.log("║         Scraper Complete! ✓            ║");
    console.log("╚════════════════════════════════════════╝\n");
    console.log(`Duration: ${duration}s`);
    console.log(`Companies processed: ${companies.length}`);
    console.log(`Price history entries: ${priceHistoryCount}`);
    console.log(`Date: ${today}\n`);
  } catch (error: any) {
    console.error("\n✗ Scraper failed:");
    console.error(error.message);

    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run the scraper
runScraper();
