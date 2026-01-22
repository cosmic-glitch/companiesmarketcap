import CompaniesTable from "@/components/CompaniesTable";
import { getCompanies, getLastUpdated } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  // Fetch companies server-side
  const { companies, total } = getCompanies({
    sortBy: "rank",
    sortOrder: "asc",
    limit: 5000, // Get all companies
  });

  const lastUpdated = getLastUpdated();

  return (
    <main className="min-h-screen bg-white">
      {/* Clean Header */}
      <div className="border-b border-slate-200 bg-white py-6 px-4 md:px-8">
        <div className="max-w-[1600px] mx-auto">
          <h1 className="text-2xl font-semibold text-slate-900">
            Largest US Companies by Market Cap
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {total.toLocaleString()} companies ranked by market capitalization
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
        <CompaniesTable companies={companies} lastUpdated={lastUpdated || undefined} />

        <footer className="mt-8 mb-6 text-center text-xs text-slate-400">
          <p>Data sourced from companiesmarketcap.com</p>
        </footer>
      </div>
    </main>
  );
}
