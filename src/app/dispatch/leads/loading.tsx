import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function LeadsLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 bg-claimondo-bg rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-claimondo-bg rounded-xl animate-pulse" />
            <div className="h-9 w-9 bg-claimondo-bg rounded-xl animate-pulse" />
          </div>
        </div>
        <LoadingSkeleton variant="table" rows={8} cols={6} />
      </div>
    </div>
  )
}
