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

2. **Data Storage** (`lib/db.ts`): Vercel Blob is the source of truth
   - Reads from the Vercel Blob URL when `BLOB_URL` is set (production **and**
     local dev — `BLOB_URL` is in `.env.local`, so dev serves the same live data
     production does).
   - Falls back to the local `data/companies.json` file only when `BLOB_URL` is
     unset (offline). That file is **gitignored and untracked**: the scraper
     overwrites it daily on the VM and uploads to Blob, so a committed copy
     drifts immediately and is intentionally not version-controlled.
   - To refresh the local fallback file, re-run `npm run scrape`, or just rely on
     `BLOB_URL` (no file needed).
   - Includes a 1-hour in-memory cache for blob data (`CACHE_TTL_MS`).

3. **API Endpoints**:
   - `app/api/companies/route.ts`: Query endpoint with search, sort, filter, pagination
   - `app/api/company/route.ts`: Lookup endpoint — fetch specific companies by symbol with optional field selection (`?symbols=AAPL,MSFT&fields=forwardPE,pctTo52WeekHigh`)
   - `app/api/scrape/route.ts`: Legacy/manual scrape endpoint (not used by scheduled automation)

4. **Frontend**: Server-rendered page with client-side interactivity
   - `app/page.tsx`: Server component that fetches all companies on initial render
   - `components/CompaniesTable.tsx`: Client component with sorting and filtering UI

### Automated Scraping (VM cron)

Primary automation runs on the Hetzner VM via cron, invoking `scripts/refresh.sh`.

**Schedule:**
- Daily at 23:00 UTC (cron `0 23 * * *`)
- Canonical schedule is committed at `scripts/crontab`; install/update it on the
  VM with `scripts/install-cron.sh` (merges into the shared crontab without
  touching other projects' entries). The live crontab (user `av`) is a superset
  shared with the `foliotracker` project.
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

### User Feedback (feature suggestions)

Visitors can submit feature ideas via the "💡 Suggest a feature" button in the
table toolbar (`components/FeedbackWidget.tsx` → `POST /api/feedback`). The
suggestion (message) is required; **name and email are both optional.**

- **Storage**: each submission is an append-only blob under the `feedback/`
  prefix in the same Vercel Blob store as `companies.json` (one object per
  submission, so concurrent visitors never clobber each other). In dev (no
  `BLOB_READ_WRITE_TOKEN`) submissions fall back to `data/feedback/`, which is
  gitignored. Helpers live in `lib/db.ts` (`writeFeedback` / `listFeedback` /
  `listPublicFeedback`).
- **Suggestions are public.** The modal lists recent suggestions, fetched from
  `GET /api/feedback` (`listPublicFeedback`, 60s in-memory cache, newest ~100).
  This returns **only public-safe fields** — `message`, `name`, `submittedAt`.
  Email and request metadata (path/UA/country/IP) are **never** exposed. There
  is no moderation: anything passing the honeypot/rate-limit/spam filters in the
  POST handler is public immediately.

**To show the user their submitted suggestions** (when they ask "show me the
feature suggestions" or similar), run the reader script — it reads live from the
production Blob using `BLOB_READ_WRITE_TOKEN` in `.env.local`, newest first:

```bash
npx tsx scripts/read-feedback.ts            # all submissions
npx tsx scripts/read-feedback.ts --since 7d # recent only (also 24h, 30m)
npx tsx scripts/read-feedback.ts --json     # raw JSON dump
```

Then summarize/cluster the results for the user.

**To delete a suggestion** (abuse/test cleanup — there is no in-app delete),
grab its `id` from the `--json` output above and run:

```bash
npx tsx scripts/delete-feedback.ts <id> [<id> ...]
```

It deletes the matching blob(s) (`deleteFeedback` in `lib/db.ts`) and clears the
public-list cache.

**To respond to a suggestion** (the owner's public reply, shown in its own
"Response" column in the suggestion modal — there is no in-app UI for writing
responses), grab the `id` from the `--json` output and run:

```bash
npx tsx scripts/respond-feedback.ts <id> "Your response text"
npx tsx scripts/respond-feedback.ts <id> --clear   # remove a response
```

It rewrites the entry in place (`setFeedbackResponse` in `lib/db.ts`), adding
`response`/`respondedAt`, and clears the public-list cache. The reply is
**public** (surfaced via `listPublicFeedback`).

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
