import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function GutachterFaelleLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-36 bg-[#f8f9fb] rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-[#f8f9fb] rounded-xl animate-pulse" />
        </div>
        <LoadingSkeleton variant="card" count={5} />
      </div>
    </div>
  )
}
