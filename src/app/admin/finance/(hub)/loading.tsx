import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function FinanceHubLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-36 bg-claimondo-bg rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-claimondo-bg rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-claimondo-border rounded-2xl p-4">
              <div className="h-3 w-16 bg-claimondo-bg rounded animate-pulse mb-2" />
              <div className="h-7 w-20 bg-claimondo-bg rounded animate-pulse" />
            </div>
          ))}
        </div>
        <LoadingSkeleton variant="table" rows={6} cols={5} />
      </div>
    </div>
  )
}
