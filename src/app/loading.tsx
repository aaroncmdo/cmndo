import Image from 'next/image'

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <Image src="/claimondo-logo.svg" alt="Claimondo" width={200} height={56} className="animate-pulse" unoptimized priority />
        <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    </div>
  )
}
