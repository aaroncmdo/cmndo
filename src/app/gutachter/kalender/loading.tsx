import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function GutachterKalenderLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 bg-claimondo-bg rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-claimondo-bg rounded-lg animate-pulse" />
            <div className="h-8 w-24 bg-claimondo-bg rounded-lg animate-pulse" />
            <div className="h-8 w-8 bg-claimondo-bg rounded-lg animate-pulse" />
          </div>
        </div>
        <LoadingSkeleton variant="block" height="h-96" />
      </div>
    </div>
  )
}
