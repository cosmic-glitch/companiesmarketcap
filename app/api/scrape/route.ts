import { put } from "@vercel/blob";
import { downloadAllCSVs } from "@/scripts/csv-downloader";
import { mergeCSVData } from "@/scripts/data-merger";

export const maxDuration = 60; // Allow up to 60 seconds for Vercel Pro

export async function GET(request: Request) {
  // Validate secret token
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (token !== process.env.SCRAPER_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Step 1: Download all CSV files
    console.log("Step 1: Downloading CSV files...");
    const csvData = await downloadAllCSVs();
    console.log(`Downloaded ${csvData.size} CSV files`);

    if (csvData.size === 0) {
      throw new Error("No CSV files downloaded");
    }

    // Step 2: Merge CSV data
    console.log("Step 2: Merging CSV data...");
    const companies = mergeCSVData(csvData);
    console.log(`Merged data for ${companies.length} companies`);

    if (companies.length === 0) {
      throw new Error("No companies found after merging");
    }

    // Step 3: Convert to database format and upload to Vercel Blob
    console.log("Step 3: Uploading to Vercel Blob...");
    const timestamp = new Date().toISOString();

    const dbCompanies = companies.map((company) => ({
      symbol: company.symbol,
      name: company.name || "",
      rank: company.rank ?? null,
      market_cap: company.marketCap ?? null,
      price: company.price ?? null,
      daily_change_percent: null,
      earnings: company.earnings ?? null,
      revenue: company.revenue ?? null,
      pe_ratio: company.peRatio ?? null,
      dividend_percent: company.dividendPercent ?? null,
      operating_margin: company.operatingMargin ?? null,
      country: company.country || "United States",
      last_updated: timestamp,
    }));

    const jsonData = {
      companies: dbCompanies,
      lastUpdated: timestamp,
      exportedAt: timestamp,
    };

    const blob = await put("companies.json", JSON.stringify(jsonData), {
      access: "public",
      addRandomSuffix: false, // Use consistent URL
      allowOverwrite: true, // Allow daily updates to overwrite existing file
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return Response.json({
      success: true,
      companies: companies.length,
      duration: `${duration}s`,
      blobUrl: blob.url,
      lastUpdated: timestamp,
    });
  } catch (error) {
    console.error("Scraper failed:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
      },
      { status: 500 }
    );
  }
}
