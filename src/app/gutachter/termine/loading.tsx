import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function GutachterTermineLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-6 w-36 bg-claimondo-bg rounded-ios-lg animate-pulse" />
        <LoadingSkeleton variant="list" count={6} />
      </div>
    </div>
  )
}
