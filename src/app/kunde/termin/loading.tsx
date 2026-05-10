import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function KundeTerminLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-6 w-44 bg-claimondo-bg rounded-lg animate-pulse" />
        <LoadingSkeleton variant="block" height="h-72" />
        <LoadingSkeleton variant="card" count={1} />
      </div>
    </div>
  )
}
