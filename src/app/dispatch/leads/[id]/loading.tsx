import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function LeadDetailLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-claimondo-bg rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-claimondo-bg/50 rounded-lg animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-claimondo-bg rounded-xl animate-pulse" />
            <div className="h-8 w-8 bg-claimondo-bg rounded-xl animate-pulse" />
          </div>
        </div>
        {/* Phase-Stepper */}
        <div className="h-12 bg-white border border-claimondo-border rounded-2xl animate-pulse" />
        {/* Content cards */}
        <LoadingSkeleton variant="card" count={3} />
      </div>
    </div>
  )
}
