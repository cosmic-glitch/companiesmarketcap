import { downloadAllCSVs } from "./csv-downloader";
import { mergeCSVData } from "./data-merger";
import { writeCompanies } from "../lib/db";

async function runScraper() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║  Companies Market Cap Data Scraper    ║");
  console.log("╚════════════════════════════════════════╝\n");

  const startTime = Date.now();

  try {
    // Step 1: Download all CSV files
    console.log("Step 1: Downloading CSV files...");
    const csvData = await downloadAllCSVs();
    console.log(`✓ Downloaded ${csvData.size} CSV files\n`);

    if (csvData.size === 0) {
      throw new Error("No CSV files downloaded. Cannot proceed.");
    }

    // Step 2: Merge CSV data
    console.log("Step 2: Merging CSV data...");
    const companies = mergeCSVData(csvData);
    console.log(`✓ Merged data for ${companies.length} companies\n`);

    if (companies.length === 0) {
      throw new Error("No companies found after merging. Cannot proceed.");
    }

    // Step 3: Write to JSON file
    console.log("Step 3: Writing companies to JSON file...");

    const today = new Date().toISOString();
    writeCompanies(companies, today);
    console.log(`✓ Wrote ${companies.length} companies to data/companies.json\n`);

    // Step 4: Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n╔════════════════════════════════════════╗");
    console.log("║         Scraper Complete! ✓            ║");
    console.log("╚════════════════════════════════════════╝\n");
    console.log(`Duration: ${duration}s`);
    console.log(`Companies processed: ${companies.length}`);
    console.log(`Date: ${new Date().toISOString().split('T')[0]}\n`);
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
