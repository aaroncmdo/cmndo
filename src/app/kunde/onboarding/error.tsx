'use client'

// CMM-14 Diagnose: dedizierte Error-Page für /kunde/onboarding mit
// vollständigem Stack-Trace-Output. Wird in Production normalerweise
// vom darüberliegenden /kunde/error.tsx maskiert — diese Boundary fängt
// genauer und zeigt mehr Details, damit wir den Server-Crash auf dem
// Onboarding-Pfad lokalisieren können.

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-white p-6 font-mono text-xs text-black">
      <h1 className="text-red-700 text-sm font-bold mb-2">
        Onboarding crash — CMM-14 diagnose
      </h1>
      <div className="mb-2">
        <strong>Message:</strong> {error.message || '(leer)'}
      </div>
      <div className="mb-2">
        <strong>Digest:</strong> {error.digest || '(keiner)'}
      </div>
      <div className="mb-2">
        <strong>Name:</strong> {error.name}
      </div>
      <pre className="bg-gray-100 p-3 rounded overflow-auto max-h-[400px] whitespace-pre-wrap break-all text-[10px]">
        {error.stack || '(kein Stack)'}
      </pre>
      <button
        onClick={reset}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-xs"
      >
        Erneut versuchen
      </button>
    </div>
  )
}
