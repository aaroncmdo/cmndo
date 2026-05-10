export default function KarteLoading() {
  return (
    <div className="flex h-full w-full">
      {/* Sidebar skeleton */}
      <div className="w-80 shrink-0 border-r border-claimondo-border bg-white p-4 space-y-3">
        <div className="h-8 w-full bg-claimondo-bg rounded-xl animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-claimondo-bg/50 border border-claimondo-border rounded-xl p-3 space-y-2">
            <div className="h-4 w-2/3 bg-claimondo-bg rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-claimondo-bg/60 rounded animate-pulse" />
          </div>
        ))}
      </div>
      {/* Map area skeleton */}
      <div className="flex-1 bg-claimondo-bg animate-pulse relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-24 bg-claimondo-bg/80 rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}
