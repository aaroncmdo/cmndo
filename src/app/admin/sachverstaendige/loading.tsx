import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function SachverstaendigeLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-claimondo-bg rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-claimondo-bg rounded-xl animate-pulse" />
            <div className="h-9 w-28 bg-claimondo-bg rounded-xl animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-claimondo-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-claimondo-bg animate-pulse shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="h-4 w-32 bg-claimondo-bg rounded animate-pulse" />
                  <div className="h-3 w-20 bg-claimondo-bg/60 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-3 w-full bg-claimondo-bg/40 rounded animate-pulse" />
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-claimondo-bg rounded-full animate-pulse" />
                <div className="h-5 w-12 bg-claimondo-bg/60 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
