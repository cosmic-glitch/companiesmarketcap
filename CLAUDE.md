# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server at localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run scrape       # Run scraper to fetch/update company data from companiesmarketcap.com
npm test             # Run Playwright tests (starts dev server automatically)
npm run test:ui      # Run Playwright tests with UI
npm run test:headed  # Run Playwright tests in headed browser mode
```

Run a single test:
```bash
npx playwright test tests/filters.spec.ts
npx playwright test -g "should display table with company data"
```

## Architecture

This is a Next.js 15 App Router application that displays US company market cap rankings with data scraped from companiesmarketcap.com.

### Data Flow

1. **Scraper** (`scripts/scraper.ts`) orchestrates data collection:
   - `csv-downloader.ts` fetches CSV files from companiesmarketcap.com endpoints
   - `data-merger.ts` combines data from multiple CSVs (market cap, earnings, revenue, P/E ratio, dividends, operating margin)
   - Data is written to `data/companies.json`

2. **Data Storage** (`lib/db.ts`): Hybrid storage with Vercel Blob
   - **Production**: Fetches from Vercel Blob URL (set via `BLOB_URL` env var)
   - **Development**: Falls back to local `data/companies.json` file
   - Includes 1-minute in-memory cache for blob data

3. **API Endpoints**:
   - `app/api/companies/route.ts`: Query endpoint with search, sort, filter, pagination
   - `app/api/scrape/route.ts`: Automated scraping endpoint (see below)

4. **Frontend**: Server-rendered page with client-side interactivity
   - `app/page.tsx`: Server component that fetches all companies on initial render
   - `components/CompaniesTable.tsx`: Client component with sorting and filtering UI

### Automated Scraping via API

The `/api/scrape` endpoint runs the full scraper and uploads to Vercel Blob:
- **Authentication**: Requires `?token=SCRAPER_SECRET` query parameter
- **Trigger**: Set up cron-job.org to call daily at 6:00 AM UTC
- **Storage**: Uploads JSON to Vercel Blob (free tier: 250 MB)
- **Timeout**: Configured for 60s max (scraper runs ~5s)

**Environment Variables** (set in Vercel dashboard):
- `SCRAPER_SECRET`: Random token for API auth (`openssl rand -hex 32`)
- `BLOB_READ_WRITE_TOKEN`: Auto-created when adding Vercel Blob
- `BLOB_URL`: Set to blob URL after first scrape run

### Planned: CDN for Data Storage

Move JSON data and logo images to Cloudflare R2 CDN to keep git repo lean (code only):

**Current state:**
- `data/companies.json` (1.4 MB) - tracked in git
- `public/logos/` (14 MB, 3557 images) - gitignored, downloaded via `npm run download-icons`

**Proposed:**
- Host both on Cloudflare R2 (free egress, ~$0.50/month at low traffic)
- JSON: short cache TTL (1 hour), updated daily by scraper
- Images: long cache TTL (1 week+), rarely change

**Implementation steps:**
1. Create R2 bucket and configure public access
2. Upload logos to R2 (one-time)
3. Modify scraper to upload `companies.json` to R2 after each run
4. Update frontend to fetch JSON from CDN URL
5. Update `CompaniesTable.tsx` to use CDN URLs for logo images
6. Remove `data/companies.json` from git tracking

### Key Types

`lib/types.ts` defines:
- `Company`: Frontend model with camelCase fields
- `DatabaseCompany`: JSON storage format with snake_case fields
- Various CSV row types for parsing different data sources
- `CompaniesQueryParams`: API query interface
