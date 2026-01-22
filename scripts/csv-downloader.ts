import axios from "axios";
import { CSVSource } from "../lib/types";

const CSV_SOURCES: CSVSource[] = [
  {
    name: "marketcap",
    url: "https://companiesmarketcap.com/usa/largest-companies-in-the-usa-by-market-cap/?download=csv",
  },
  {
    name: "earnings",
    url: "https://companiesmarketcap.com/usa/most-profitable-american-companies/?download=csv",
    metricField: "Earnings",
  },
  {
    name: "revenue",
    url: "https://companiesmarketcap.com/usa/largest-american-companies-by-revenue/?download=csv",
    metricField: "Revenue",
  },
  {
    name: "pe_ratio",
    url: "https://companiesmarketcap.com/usa/american-companies-ranked-by-pe-ratio/?download=csv",
    metricField: "P/E ratio",
  },
  {
    name: "dividend",
    url: "https://companiesmarketcap.com/usa/american-companies-ranked-by-dividend-yield/?download=csv",
    metricField: "Dividend %",
  },
  {
    name: "operating_margin",
    url: "https://companiesmarketcap.com/usa/american-companies-ranked-by-operating-margin/?download=csv",
    metricField: "Operating Margin",
  },
];

// Download CSV with retry logic
export async function downloadCSV(url: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Downloading ${url} (attempt ${attempt}/${maxRetries})...`);

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CompaniesMarketCapClone/1.0)",
        },
      });

      if (response.status === 200 && response.data) {
        console.log(`✓ Successfully downloaded from ${url}`);
        return response.data;
      }

      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (error: any) {
      console.error(`✗ Failed to download ${url} (attempt ${attempt}/${maxRetries}):`, error.message);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`  Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(`Failed to download ${url} after ${maxRetries} attempts: ${error.message}`);
      }
    }
  }

  throw new Error(`Failed to download ${url}`);
}

// Download all CSVs
export async function downloadAllCSVs(): Promise<Map<string, string>> {
  console.log("\n=== Starting CSV Downloads ===\n");

  const results = new Map<string, string>();
  const errors: string[] = [];

  for (const source of CSV_SOURCES) {
    try {
      const csvData = await downloadCSV(source.url);
      results.set(source.name, csvData);
      console.log(`✓ ${source.name}: ${csvData.split("\n").length - 1} rows\n`);
    } catch (error: any) {
      errors.push(`${source.name}: ${error.message}`);
      console.error(`✗ ${source.name}: ${error.message}\n`);
    }
  }

  console.log("\n=== Download Summary ===");
  console.log(`✓ Successful: ${results.size}/${CSV_SOURCES.length}`);
  console.log(`✗ Failed: ${errors.length}/${CSV_SOURCES.length}`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((error) => console.log(`  - ${error}`));
  }

  if (results.size === 0) {
    throw new Error("Failed to download any CSV files");
  }

  return results;
}

// Get CSV source configuration
export function getCSVSources(): CSVSource[] {
  return CSV_SOURCES;
}
