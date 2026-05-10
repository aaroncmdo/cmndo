import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

export default function DispatchLoading() {
  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-40 bg-[#f8f9fb] rounded-lg animate-pulse" />
            <div className="h-4 w-28 bg-[#f8f9fb]/50 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="h-10 w-32 bg-[#f8f9fb] rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-claimondo-border rounded-2xl p-4">
              <div className="h-3 w-14 bg-[#f8f9fb] rounded animate-pulse mb-2" />
              <div className="h-7 w-16 bg-[#f8f9fb] rounded animate-pulse" />
            </div>
          ))}
        </div>
        <LoadingSkeleton variant="table" rows={6} cols={5} />
      </div>
    </div>
  )
}
