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
    <main className="min-h-screen bg-slate-50">
      {/* Gradient Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-12 px-4 md:px-8 mb-8">
        <div className="max-w-[1600px] mx-auto">
          <h1 className="text-5xl font-bold mb-3 animate-fade-in">
            Companies Market Cap
          </h1>
          <p className="text-xl text-blue-100">
            Real-time ranking of {total.toLocaleString()} US companies by market capitalization
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-8">
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
          <CompaniesTable companies={companies} lastUpdated={lastUpdated || undefined} />
        </div>

        <footer className="mt-12 mb-8 text-center text-sm text-slate-500">
          <p>Data sourced from companiesmarketcap.com</p>
          <p className="mt-1 text-slate-400">Built with Next.js, TypeScript, and SQLite</p>
        </footer>
      </div>
    </main>
  );
}
