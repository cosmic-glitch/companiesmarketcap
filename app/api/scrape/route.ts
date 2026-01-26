import { put } from "@vercel/blob";
import { runFMPScraper } from "@/scripts/fmp-scraper";

export const maxDuration = 300; // Allow up to 5 minutes for FMP API fetching

export async function GET(request: Request) {
  // Validate secret token
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (token !== process.env.SCRAPER_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Run the FMP scraper
    console.log("Starting FMP scraper...");
    const { companies, lastUpdated } = await runFMPScraper();
    console.log(`FMP scraper complete: ${companies.length} companies`);

    if (companies.length === 0) {
      throw new Error("No companies returned from FMP scraper");
    }

    // Upload to Vercel Blob
    console.log("Uploading to Vercel Blob...");
    const jsonData = {
      companies,
      lastUpdated,
      exportedAt: lastUpdated,
    };

    const blob = await put("companies.json", JSON.stringify(jsonData), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return Response.json({
      success: true,
      companies: companies.length,
      duration: `${duration}s`,
      blobUrl: blob.url,
      lastUpdated,
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
