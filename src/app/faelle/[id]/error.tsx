'use client'

// AAR-271: window.location.reload() statt reset()
// AAR-650: Error-Message + Digest anzeigen damit der konkrete Ursache-Stack
// direkt sichtbar ist (bisher nur „Fehler beim Laden" → keine Debug-Info).
export default function FallakteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-xl">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Fehler beim Laden des Falls</h1>
        <p className="text-sm text-gray-500 mb-4">
          Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt, kontaktieren Sie den Support mit folgender Info.
        </p>
        {(error.message || error.digest) && (
          <div className="text-left mb-5 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 space-y-1 max-h-40 overflow-y-auto">
            {error.message && (
              <p className="text-[11px] font-mono text-gray-700 break-all">{error.message}</p>
            )}
            {error.digest && (
              <p className="text-[10px] font-mono text-gray-400">digest: {error.digest}</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-[#4573A2] text-white font-medium text-sm rounded-xl hover:bg-[#1E3A5F] transition-colors"
          >
            Erneut versuchen
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium text-sm rounded-xl hover:bg-gray-50 transition-colors"
          >
            Seite neu laden
          </button>
        </div>
      </div>
    </div>
  )
}
