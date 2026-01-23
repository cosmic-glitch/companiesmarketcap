export default function Loading() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header skeleton */}
      <div className="border-b border-slate-200 bg-white py-6 px-4 md:px-8">
        <div className="max-w-[1600px] mx-auto">
          <div className="h-8 w-96 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse mt-2" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
        {/* Filters skeleton */}
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="h-4 w-16 bg-slate-200 rounded animate-pulse mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="h-8 bg-slate-200 rounded animate-pulse" />
                  <div className="h-8 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Table skeleton */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[...Array(10)].map((_, i) => (
                  <th key={i} className="px-4 py-3">
                    <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {[...Array(20)].map((_, rowIndex) => (
                <tr key={rowIndex} className="border-b border-slate-100">
                  {[...Array(10)].map((_, colIndex) => (
                    <td key={colIndex} className="px-4 py-2.5">
                      <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination skeleton */}
        <div className="flex items-center justify-between py-4">
          <div className="h-4 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-10 w-28 bg-slate-200 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    </main>
  );
}
