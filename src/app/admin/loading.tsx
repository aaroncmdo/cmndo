export default function AdminLoading() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-48 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-gray-100/50 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="h-10 w-36 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="h-3 w-16 bg-gray-100 rounded animate-pulse mb-2" />
              <div className="h-7 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3 flex gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 bg-gray-100 rounded animate-pulse flex-1" />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border-b border-gray-200/50 px-4 py-4 flex gap-4">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="h-4 bg-gray-100/50 rounded animate-pulse flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
