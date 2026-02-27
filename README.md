# Companies Market Cap - US Stock Rankings

A modern, unified web application that displays real-time rankings of US companies by market capitalization and other financial metrics. This is an improved clone of companiesmarketcap.com with a streamlined, single-page interface.

## Features

- **Unified Interface**: Single page displaying all US companies with sortable columns
- **Scheduled Refreshes**: GitHub Actions runs the scraper every 3 days and uploads to Vercel Blob
- **Sortable Columns**: Click any column header to sort by:
  - Rank
  - Company Name
  - Ticker Symbol
  - Market Cap
  - Price
  - Daily Change %
  - Earnings
  - Revenue
  - P/E Ratio
  - Dividend %
  - Operating Margin
- **Search Functionality**: Real-time search by company name or ticker symbol
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **3,500+ Companies**: Comprehensive dataset of US public companies

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **UI**: React 19 with Tailwind CSS
- **Data**: JSON file storage
- **Data Scraping**: axios + csv-parse
- **Deployment**: Vercel-ready

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository (if not already):
```bash
cd /Users/anuragved/code/companiesmarketcap
```

2. Install dependencies (already done):
```bash
npm install
```

3. Run the scraper to populate the data:
```bash
npm run scrape
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run scrape` - Run data scraper to update data

## Automated Data Refresh

- Workflow: `.github/workflows/fmp-refresh.yml`
- Schedule: every 3rd day at 18:30 UTC, plus manual trigger (`workflow_dispatch`)
- Runtime: runs entirely on GitHub Actions (not a Vercel Function), so long scrape duration is supported
- Required GitHub repo secrets:
  - `FMP_API_KEY`
  - `BLOB_READ_WRITE_TOKEN`
- Output: scraper writes `data/companies.json` and uploads `companies.json` to Vercel Blob
- Production read path: app fetches Blob JSON via `BLOB_URL`

## Project Structure

```
companiesmarketcap/
├── app/                      # Next.js app directory
│   ├── api/                  # API routes
│   │   └── companies/        # Companies API endpoint
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Main page
│   └── globals.css           # Global styles
├── components/               # React components
│   └── CompaniesTable.tsx    # Main table component
├── lib/                      # Utilities and data access
│   ├── db.ts                 # Data access functions
│   ├── types.ts              # TypeScript types
│   └── utils.ts              # Utility functions
├── scripts/                  # Data scraping scripts
│   ├── scraper.ts            # Main scraper
│   ├── csv-downloader.ts     # CSV download logic
│   └── data-merger.ts        # Data merging logic
├── data/                     # Data storage
│   └── companies.json        # Company data file
└── public/                   # Static assets
```

## Data Schema

The `data/companies.json` file contains an array of company records with the following fields:
- `symbol` - Stock ticker (unique identifier)
- `name` - Company name
- `rank` - Market cap rank
- `market_cap` - Market capitalization
- `price` - Current stock price
- `daily_change_percent` - Daily price change percentage
- `earnings` - Company earnings
- `revenue` - Company revenue
- `pe_ratio` - Price-to-earnings ratio
- `dividend_percent` - Dividend yield percentage
- `operating_margin` - Operating margin percentage
- `country` - Country (always "United States")
- `last_updated` - Last update timestamp

## Data Sources

Data is scraped from the following CSV endpoints on companiesmarketcap.com:
- US Companies by Market Cap
- Most Profitable Companies (filtered for US)
- Largest Companies by Revenue (filtered for US)
- Top Companies by P/E Ratio (filtered for US)
- Top Companies by Dividend Yield (filtered for US)
- Top Companies by Operating Margin (filtered for US)

## Key Improvements Over Original Site

1. **Unified View**: All metrics on one page instead of separate ranking pages
2. **Dynamic Sorting**: Sort by any column with a single click
3. **Better UX**: Cleaner, more modern interface
4. **Search**: Quick search to find specific companies
5. **Performance**: Server-side rendering with Next.js

## Current Limitations

- Some CSV files have formatting issues, resulting in missing data for earnings, revenue, P/E ratio, dividend %, and operating margin
- Daily change % calculation requires at least one previous day's data
- Full scrape duration is long (~2 hours), so refreshes happen in background jobs rather than on-request API execution

## Future Enhancements

- Fix CSV parsing issues to populate all metrics
- Historical price charts
- Company detail pages
- Dark mode
- Advanced filtering (by sector, market cap range, etc.)
- CSV export functionality
- User watchlists

## Development

The application is built with:
- Server-side rendering for fast initial page load
- Client-side interactivity for sorting and searching
- JSON file for simple data storage
- Type-safe TypeScript throughout

## Deployment

To deploy to Vercel:

1. Push code to GitHub
2. Connect repository to Vercel
3. Deploy
4. In GitHub repository settings, add secrets:
   - `FMP_API_KEY`
   - `BLOB_READ_WRITE_TOKEN`
5. Enable/run the `FMP Refresh` GitHub Actions workflow for scheduled data refreshes
6. In Vercel project settings, set `BLOB_URL` to the Blob URL for `companies.json`

## License

MIT

## Data Attribution

Data sourced from companiesmarketcap.com
