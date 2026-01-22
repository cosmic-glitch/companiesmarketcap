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
   - Data is upserted into SQLite database with price history tracking

2. **Database** (`lib/db.ts`): SQLite with better-sqlite3
   - `companies` table: Core company data with all financial metrics
   - `price_history` table: Historical prices for daily change calculation
   - Uses WAL mode for better concurrent access

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
- Verify better-sqlite3 compatibility with Vercel's serverless environment

### Key Types

`lib/types.ts` defines:
- `Company`: Frontend model with camelCase fields
- `DatabaseCompany`: Database model with snake_case fields
- Various CSV row types for parsing different data sources
- `CompaniesQueryParams`: API query interface
