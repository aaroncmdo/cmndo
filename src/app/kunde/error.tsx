'use client'

// CMM-14 Diagnose: Layout-Boundary für /kunde/* Crashes mit
// vollständigem Stack-Trace. In Production maskiert die normale ErrorState-
// Component den Stack — diese Variante zeigt ihn explizit damit wir den
// Onboarding-Crash sehen können.

export default function KundeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-white p-6 font-mono text-xs text-black">
      <h1 className="text-red-700 text-sm font-bold mb-2">
        /kunde Layout crash — CMM-14 diagnose
      </h1>
      <div className="mb-2"><strong>Message:</strong> {error.message || '(leer)'}</div>
      <div className="mb-2"><strong>Digest:</strong> {error.digest || '(keiner)'}</div>
      <div className="mb-2"><strong>Name:</strong> {error.name}</div>
      <pre className="bg-gray-100 p-3 rounded overflow-auto max-h-[400px] whitespace-pre-wrap break-all text-[10px]">
        {error.stack || '(kein Stack)'}
      </pre>
      <button onClick={reset} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-xs">
        Erneut versuchen
      </button>
    </div>
  )
}
