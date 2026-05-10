import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function KundeFallDetailLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Status badge + Titel */}
        <div className="space-y-2">
          <div className="h-5 w-24 bg-claimondo-bg rounded-full animate-pulse" />
          <div className="h-6 w-48 bg-claimondo-bg rounded-lg animate-pulse" />
        </div>
        {/* Timeline */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-3 h-3 mt-1 rounded-full bg-claimondo-bg animate-pulse shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-40 bg-claimondo-bg rounded animate-pulse" />
                <div className="h-3 w-24 bg-claimondo-bg/60 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <LoadingSkeleton variant="card" count={2} />
      </div>
    </div>
  )
}
