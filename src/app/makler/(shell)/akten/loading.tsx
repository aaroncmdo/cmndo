import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function MaklerAktenLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="h-6 w-32 bg-claimondo-bg rounded-lg animate-pulse" />
        <LoadingSkeleton variant="list" count={5} />
      </div>
    </div>
  )
}
