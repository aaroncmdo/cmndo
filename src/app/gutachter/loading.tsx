import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function GutachterLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-6 w-44 bg-claimondo-bg rounded-lg animate-pulse" />
        <LoadingSkeleton variant="card" count={4} />
      </div>
    </div>
  )
}
