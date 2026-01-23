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

2. **Data Storage** (`lib/db.ts`): JSON file-based storage
   - `data/companies.json`: All company data with financial metrics
   - Simple read/write operations for Vercel compatibility

3. **API** (`app/api/companies/route.ts`): Single endpoint supporting:
   - Search by name/symbol
   - Sort by any column
   - Market cap range filtering
   - Pagination

4. **Frontend**: Server-rendered page with client-side interactivity
   - `app/page.tsx`: Server component that fetches all companies on initial render
   - `components/CompaniesTable.tsx`: Client component with sorting and filtering UI

### Planned: Automated Scraping via API

Create a Vercel API endpoint (`/api/scrape`) to be triggered by cron-job.org for free scheduled updates. Considerations:
- Add secret token authentication to protect the endpoint
- Handle Vercel timeout limits (10s hobby / 60s pro) - may need to optimize or chunk work

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
