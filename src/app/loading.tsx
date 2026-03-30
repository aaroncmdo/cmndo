export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Laden...</p>
      </div>
    </div>
  )
}
