export default function Loading() {
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <span className="text-4xl font-bold tracking-tight animate-pulse"><span className="text-claimondo-navy">Claim</span><span className="text-claimondo-ondo">ondo</span></span>
        <div className="w-8 h-8 border-2 border-claimondo-border border-t-claimondo-ondo rounded-full animate-spin" />
      </div>
    </div>
  )
}
