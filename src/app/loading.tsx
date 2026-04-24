export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <span className="text-4xl font-bold tracking-tight animate-pulse"><span className="text-[#0D1B3E]">Claim</span><span className="text-[#4573A2]">ondo</span></span>
        <div className="w-8 h-8 border-2 border-claimondo-border border-t-[#4573A2] rounded-full animate-spin" />
      </div>
    </div>
  )
}
