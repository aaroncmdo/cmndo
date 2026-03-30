'use client'

export default function SachverstaendigeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-red-900/50">
          <h2 className="text-white text-lg font-semibold mb-2">Fehler beim Laden</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Die Sachverständigen-Seite konnte nicht geladen werden.
            {error.message && (
              <span className="block text-red-400 text-xs mt-2">{error.message}</span>
            )}
          </p>
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    </div>
  )
}
