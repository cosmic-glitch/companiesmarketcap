# Companies Market Cap — Global Stock Screener

A single-page stock screener that ranks ~2,600 publicly traded companies worldwide
(market cap ≥ $1B) by market capitalization and lets you sort, filter and compare
them across valuation, profitability and growth metrics.

Fundamentals come from the [Financial Modeling Prep](https://financialmodelingprep.com/)
(FMP) API and are refreshed daily; prices are overlaid live from Yahoo Finance.

## Features

- **Sortable, configurable table** — click any header to sort; a column picker
  shows/hides columns. Rank and name are always visible.
- **Columns**: Market Cap, Price, Today (daily change %), 10Y Revenue Trend,
  10Y EPS Trend, % to 52-Week High, P/E, Fwd P/E (current FY), Fwd P/E Next FY, Fwd P/E FY+2,
  Earnings, Revenue, Fwd EPS Growth, Dividend Yield, Operating Margin,
  Revenue CAGR 5Y/3Y, EPS CAGR 5Y/3Y, plus optional Country, Sector, Industry,
  FCF and Net Debt.
- **Min/max range filters** on every numeric metric, plus country and sector
  filters. All state lives in the URL (short aliases like `mc.min`, `fpe.max`),
  so any view can be shared as a link.
- **Presets** — curated screens (Mega Cap Value, Great Price for Reasonable
  Growth, Reliable Dividend Generators) plus user-saved presets.
- **Search** by name or ticker, including multi-ticker lookup (`AAPL, MSFT, NVDA`).
- **Live prices** — price, market cap and daily change are refreshed from
  Yahoo Finance on request (1-minute server cache).
- **Data-quality transparency** — rows with implausible data are hidden from the
  leaderboard and listed in a "hidden entries" modal explaining why.
- **Feature suggestions** — visitors can submit and browse public suggestions.
- Pagination (100 rows per page) and responsive layout.

## Technology Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS
- **Data storage**: Vercel Blob (`companies.json`, presets, feedback)
- **Data sources**: FMP stable API (via axios), open.er-api.com (FX rates),
  Yahoo Finance via `yahoo-finance2` (live quotes)
- **Hosting**: Vercel (app) + Hetzner VM (daily scrape via cron)
- **Tests**: Playwright

## Getting Started

### Prerequisites

- Node.js 18.18+ and npm

### Installation

```bash
git clone https://github.com/cosmic-glitch/companiesmarketcap.git
cd companiesmarketcap
npm install
```

Create `.env.local`. The simplest setup points at the production data blob, so
no scrape is needed:

```bash
BLOB_URL=<public Vercel Blob URL of companies.json>
```

Without `BLOB_URL`, the app falls back to a local `data/companies.json`, which
you can generate with `npm run scrape` (requires `FMP_API_KEY`; a full scrape
takes a long time).

```bash
npm run dev   # http://localhost:3000
```

### Environment Variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `BLOB_URL` | App | Public URL of `companies.json` in Vercel Blob. Unset → read local `data/companies.json`. |
| `BLOB_READ_WRITE_TOKEN` | Scraper, app, admin scripts | Upload data; read/write presets and feedback. |
| `FMP_API_KEY` | Scraper | Financial Modeling Prep API key. |
| `PRESETS_BLOB_URL` | App | Optional explicit URL for the user-presets blob (otherwise derived). |
| `SCRAPER_SECRET` | `/api/scrape` | Token for the legacy manual scrape endpoint. |

## Scripts

```bash
npm run dev            # Start dev server
npm run build          # Production build
npm start              # Start production server
npm run lint           # ESLint
npm run scrape         # Full FMP scrape → data/companies.json (+ Blob upload if token set)
npm run download-icons # Download company logos into public/logos
npm test               # Playwright tests (also test:ui, test:headed)
```

Partial scrapes update only some fields of the existing data:

```bash
npm run scrape -- --only quotes         # price / market cap / daily change
npm run scrape -- --only forward_pe     # forward P/E (current FY, next FY, FY+2)
npm run scrape -- --only financials     # revenue / earnings / margins / ratios
npm run scrape -- --only growth         # growth metrics
# also: pe_ratio, week_52_high, new_symbols, currency_fix, annual_revenue, annual_eps
```

Admin scripts (run with `npx tsx`, read `.env.local`):

| Script | Purpose |
| --- | --- |
| `scripts/upload-blob.ts` | Upload local `data/companies.json` to Blob |
| `scripts/read-feedback.ts [--since 7d] [--json]` | List feature suggestions |
| `scripts/respond-feedback.ts <id> "text"` | Post a public response (`--clear` to remove) |
| `scripts/delete-feedback.ts <id>...` | Delete suggestions |
| `scripts/delete-preset.ts <id>` | Delete a user-saved preset |

## Data Pipeline

### Scraper (`scripts/fmp-scraper.ts`)

A full scrape runs these steps against `https://financialmodelingprep.com/stable`:

1. **Universe** — `company-screener` for actively traded, non-ETF/fund stocks
   with market cap > $1B, plus a small list of supplemental symbols.
2. **Quotes** — price, market cap, trailing P/E, daily change, 52-week high.
3. **Profiles** — name, country, sector, industry. Duplicate listings of the
   same company are collapsed, keeping the largest by market cap.
4. **FX rates** from open.er-api.com, used to convert non-USD financials to USD.
5. **Per-symbol fundamentals**:
   - Quarterly income statements → TTM revenue, earnings, operating margin
   - Annual income statements → 10-year revenue and EPS series
   - Ratios TTM → dividend yield
   - Financial growth → 3Y/5Y revenue and EPS CAGR
   - Analyst estimates → forward EPS / P/E for the current, next and following (FY+2) fiscal years
   - Cash-flow statements → TTM free cash flow (annual fallback)
   - Latest balance sheet → net debt
6. **Rank** by market cap, tag each row with data-quality issue codes
   (`lib/data-quality.ts`), write `data/companies.json`, and upload it to Vercel
   Blob when `BLOB_READ_WRITE_TOKEN` is set.

Requests are made one at a time with a short delay and automatic retry/backoff
on rate limits and transient errors, so a full scrape is long-running.

### Automated Daily Refresh

- **Host**: Hetzner VM, user-level cron (not a Vercel Function, so run time is
  not limited)
- **Schedule**: daily at 23:00 UTC (`0 23 * * *`); canonical entry in
  `scripts/crontab`, installed/merged with `scripts/install-cron.sh` (the VM
  crontab is shared with other projects — don't `crontab scripts/crontab`)
- **Wrapper**: `scripts/refresh.sh` — sources `.env.local`, runs
  `git pull --ff-only origin main` (non-fatal), then `npm run scrape`
- **Required secrets** in `~/companiesmarketcap/.env.local`: `FMP_API_KEY`,
  `BLOB_READ_WRITE_TOKEN`
- **Logs**: `scripts/refresh.log` on the VM

`/api/scrape` still exists for manual runs but is not used by the schedule
(its 5-minute function limit is too short for a full scrape).

### Serving

`lib/db.ts` reads `companies.json` from `BLOB_URL` (1-hour in-memory cache),
then `app/page.tsx` / `app/api/companies` overlay live Yahoo quotes and apply
search, filters, sort and pagination server-side. `data/companies.json` is
gitignored; Blob is the source of truth.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/companies` | Search, filter, sort and paginate companies |
| `GET /api/company?symbols=AAPL,MSFT&fields=forwardPE,pctTo52WeekHigh` | Look up specific companies, optionally selecting fields |
| `GET /api/quotes?symbols=...` | Live Yahoo quotes (max 100 symbols) |
| `POST/DELETE /api/presets` | Save / delete a user preset |
| `GET/POST /api/feedback` | List public suggestions / submit one |
| `GET /api/scrape?token=...` | Legacy manual scrape |

## Project Structure

```
companiesmarketcap/
├── app/
│   ├── api/{companies,company,quotes,presets,feedback,scrape}/route.ts
│   ├── page.tsx              # Server component: loads data + quotes, renders table
│   ├── layout.tsx, loading.tsx, globals.css
├── components/
│   ├── CompaniesTable.tsx    # Table, filters, column picker, presets, search
│   ├── Pagination.tsx
│   ├── FeedbackWidget.tsx    # "Suggest a feature" modal
│   ├── SavePresetModal.tsx
│   ├── HiddenEntriesModal.tsx
│   └── UsdEstimateModal.tsx
├── lib/
│   ├── db.ts                 # Blob/local data access, querying, presets, feedback
│   ├── types.ts              # Company (camelCase) / DatabaseCompany (snake_case)
│   ├── quotes.ts, yahoo-finance.ts   # Live quote fetching + cache
│   ├── data-quality.ts       # Data-quality issue detection
│   ├── url-aliases.ts        # Short URL param aliases
│   └── company-name.ts, countries.ts, filter-summary.ts, preset-summary.ts, utils.ts
├── scripts/                  # Scraper, cron wrapper, admin scripts
├── tests/                    # Playwright specs
└── public/logos/             # Company logos
```

## Data Schema

`companies.json` has the shape `{ companies: DatabaseCompany[], lastUpdated, exportedAt }`.
Key fields per company (see `lib/types.ts` for the full list):

| Field | Description |
| --- | --- |
| `symbol`, `name`, `country`, `sector`, `industry` | Identity (country is an ISO code) |
| `rank`, `market_cap`, `price`, `daily_change_percent`, `week_52_high` | From FMP quote |
| `pe_ratio`, `ttm_eps` | Trailing P/E and EPS |
| `forward_pe`, `forward_eps` | Current-FY analyst estimate (blends reported + projected quarters) |
| `forward_pe_next`, `forward_eps_next` | Next-FY analyst estimate (pure projection) |
| `forward_pe_next2`, `forward_eps_next2` | FY+2 analyst estimate (pure projection, thinner coverage) |
| `earnings`, `revenue`, `operating_margin` | TTM, sum of last 4 quarters, in USD |
| `free_cash_flow`, `net_debt` | TTM FCF; latest net debt |
| `dividend_percent` | Dividend yield TTM |
| `revenue_growth_5y/3y`, `eps_growth_5y/3y` | CAGRs |
| `revenue_annual`, `eps_annual` | 10-year annual series |
| `data_quality_issues` | Issue codes; flagged rows are hidden from rankings |
| `last_updated` | Timestamp |

## License

MIT

## Data Attribution

Fundamentals and estimates from [Financial Modeling Prep](https://financialmodelingprep.com/);
live prices from Yahoo Finance; FX rates from [open.er-api.com](https://www.exchangerate-api.com/);
company logos from companiesmarketcap.com.
