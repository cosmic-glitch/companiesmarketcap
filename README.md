# Companies Market Cap - US Stock Rankings

A modern, unified web application that displays real-time rankings of US companies by market capitalization and other financial metrics. This is an improved clone of companiesmarketcap.com with a streamlined, single-page interface.

## Features

- **Unified Interface**: Single page displaying all US companies with sortable columns
- **Real-Time Data**: Auto-updates via scraper that fetches data from companiesmarketcap.com
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
- **3,500+ Companies**: Comprehensive database of US public companies

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **UI**: React 19 with Tailwind CSS
- **Database**: SQLite with better-sqlite3
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

3. Run the scraper to populate the database:
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
- `npm run scrape` - Run data scraper to update database

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
├── lib/                      # Utilities and database
│   ├── db.ts                 # Database functions
│   ├── types.ts              # TypeScript types
│   └── utils.ts              # Utility functions
├── scripts/                  # Data scraping scripts
│   ├── scraper.ts            # Main scraper
│   ├── csv-downloader.ts     # CSV download logic
│   └── data-merger.ts        # Data merging logic
├── data/                     # Database storage
│   └── companies.db          # SQLite database
└── public/                   # Static assets
```

## Database Schema

### Companies Table
- `symbol` - Stock ticker (Primary Key)
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

### Price History Table
- `id` - Auto-incrementing ID
- `symbol` - Stock ticker (Foreign Key)
- `price` - Historical price
- `date` - Date of price record

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
- Data updates are manual (run `npm run scrape` to update)

## Future Enhancements

- Fix CSV parsing issues to populate all metrics
- Automated daily data updates (cron job or Vercel Cron)
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
- SQLite for efficient data storage and querying
- Type-safe TypeScript throughout

## Deployment

To deploy to Vercel:

1. Push code to GitHub
2. Connect repository to Vercel
3. Deploy
4. Set up Vercel Cron to run scraper daily

## License

MIT

## Data Attribution

Data sourced from companiesmarketcap.com
