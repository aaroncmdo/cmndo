import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function KundeFaelleLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-6 w-36 bg-[#f8f9fb] rounded-lg animate-pulse" />
        <LoadingSkeleton variant="card" count={3} />
      </div>
    </div>
  )
}
