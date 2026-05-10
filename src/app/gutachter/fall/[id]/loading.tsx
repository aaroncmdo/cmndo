import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function GutachterFallDetailLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="space-y-2">
          <div className="h-6 w-52 bg-[#f8f9fb] rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-[#f8f9fb] rounded-full animate-pulse" />
            <div className="h-5 w-24 bg-[#f8f9fb]/60 rounded-full animate-pulse" />
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-2 border-b border-claimondo-border pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-24 bg-[#f8f9fb] rounded-lg animate-pulse" />
          ))}
        </div>
        <LoadingSkeleton variant="card" count={2} />
      </div>
    </div>
  )
}
