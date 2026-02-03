# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server at localhost:3000
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run scrape       # Run FMP scraper to fetch/update company data from Financial Modeling Prep API
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

This is a Next.js 15 App Router application that displays US company market cap rankings with data from the Financial Modeling Prep (FMP) API.

### Data Flow

1. **Scraper** (`scripts/fmp-scraper.ts`) fetches all data from FMP API:
   - Stock list from `stock-screener?country=US&isActivelyTrading=true`
   - Batch quotes (price, market cap, P/E ratio, daily change)
   - Batch profiles (name, country)
   - Quarterly income statements (TTM revenue, earnings, operating margin)
   - Ratios TTM (dividend yield)
   - Financial growth (5Y revenue/EPS growth CAGR)
   - Analyst estimates (forward P/E)
   - Calculates rank by market cap
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

### Automated Scraping (Local)

The scraper runs locally via macOS launchd every 3 days. This replaces the previous Vercel API approach which timed out (scraping takes ~10-30 minutes).

**LaunchAgent:** `~/Library/LaunchAgents/com.companiesmarketcap.scraper.plist`

**Commands:**
```bash
# Manual run
launchctl start com.companiesmarketcap.scraper

# Check status
launchctl list | grep companiesmarketcap

# View logs
tail -f ~/Library/Logs/companiesmarketcap-scraper.log

# Reload after editing plist
launchctl unload ~/Library/LaunchAgents/com.companiesmarketcap.scraper.plist
launchctl load ~/Library/LaunchAgents/com.companiesmarketcap.scraper.plist
```

**Environment Variables** (in `.env.local`):
- `FMP_API_KEY`: Financial Modeling Prep API key (required)
- `BLOB_READ_WRITE_TOKEN`: For uploading to Vercel Blob

**Notes:**
- Job runs every 3 days when Mac is awake
- Logs: `~/Library/Logs/companiesmarketcap-scraper.log`
- The `/api/scrape` endpoint still exists but times out on Vercel

### Data Fields

Each company includes:
- `symbol`, `name`, `country`: Basic info from FMP profile
- `market_cap`, `price`, `daily_change_percent`: From FMP quote
- `pe_ratio`: Trailing P/E from FMP quote
- `forward_pe`: Current price / analyst EPS estimate
- `earnings`, `revenue`: TTM values (sum of last 4 quarters)
- `operating_margin`: TTM operating income / TTM revenue
- `dividend_percent`: Dividend yield TTM from FMP ratios
- `revenue_growth_5y`, `eps_growth_5y`: 5-year CAGR from FMP financial-growth
- `rank`: Calculated from market cap descending order

### Key Types

`lib/types.ts` defines:
- `Company`: Frontend model with camelCase fields
- `DatabaseCompany`: JSON storage format with snake_case fields
- `CompaniesQueryParams`: API query interface

## Workflow

- Do not run automated tests (Playwright) unless explicitly asked
