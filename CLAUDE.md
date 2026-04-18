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
npx tsx scripts/upload-blob.ts  # Upload local companies.json to Vercel Blob (production data)
```

Run a single test:
```bash
npx playwright test tests/filters.spec.ts
npx playwright test -g "should display table with company data"
```

## Architecture

This is a Next.js 15 App Router application that displays global company market cap rankings with data from the Financial Modeling Prep (FMP) API.

### Data Flow

1. **Scraper** (`scripts/fmp-scraper.ts`) fetches all data from FMP API:
   - Global stock list from `company-screener?marketCapMoreThan=1000000000&isActivelyTrading=true`
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
   - `app/api/company/route.ts`: Lookup endpoint — fetch specific companies by symbol with optional field selection (`?symbols=AAPL,MSFT&fields=forwardPE,pctTo52WeekHigh`)
   - `app/api/scrape/route.ts`: Legacy/manual scrape endpoint (not used by scheduled automation)

4. **Frontend**: Server-rendered page with client-side interactivity
   - `app/page.tsx`: Server component that fetches all companies on initial render
   - `components/CompaniesTable.tsx`: Client component with sorting and filtering UI

### Automated Scraping (VM cron)

Primary automation runs on the DigitalOcean VM via cron, invoking `scripts/refresh.sh`.

**Schedule:**
- Every Thursday at 18:30 UTC
- Single cron entry in user `av`'s crontab (`crontab -l`)
- Runs `npm run scrape` against the working tree at `~/companiesmarketcap`

**Wrapper behavior (`scripts/refresh.sh`):**
- Sources secrets from `.env.local`
- `git pull --ff-only origin main` so scraper edits propagate without manual SSH (non-fatal on failure)
- Appends all output to `scripts/refresh.log`

**Required secrets in `~/companiesmarketcap/.env.local`:**
- `FMP_API_KEY`: Financial Modeling Prep API key
- `BLOB_READ_WRITE_TOKEN`: Upload token for Vercel Blob

**Notes:**
- `/api/scrape` still exists, but is not used for scheduled refreshes
- **Production reads from Vercel Blob, not local JSON.**
- Full scraper uploads to Blob automatically when `BLOB_READ_WRITE_TOKEN` is set
- Previously ran via a Codex automation on the user's MacBook; moved to the VM because the Mac wasn't always on

**Manual run / debugging:**

```bash
# Trigger a refresh immediately
~/companiesmarketcap/scripts/refresh.sh

# Tail the log
tail -f ~/companiesmarketcap/scripts/refresh.log

# Inspect the cron entry
crontab -l | grep companiesmarketcap
```

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
