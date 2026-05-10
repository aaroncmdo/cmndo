import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

// AAR-414: auf LoadingSkeleton-Primitive migriert
export default function AdminLoading() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-48 bg-claimondo-bg rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-claimondo-bg/50 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="h-10 w-36 bg-claimondo-bg rounded-xl animate-pulse" />
        </div>
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-claimondo-border rounded-2xl p-4">
              <div className="h-3 w-16 bg-claimondo-bg rounded animate-pulse mb-2" />
              <div className="h-7 w-20 bg-claimondo-bg rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <LoadingSkeleton variant="table" rows={5} cols={5} />
      </div>
    </div>
  )
}
