import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function MaklerLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-36 bg-claimondo-bg rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-claimondo-bg rounded-xl animate-pulse" />
        </div>
        <LoadingSkeleton variant="table" rows={6} cols={4} />
      </div>
    </div>
  )
}
