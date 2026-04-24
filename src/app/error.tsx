'use client'

import { useEffect } from 'react'

// AAR-271: window.location.reload() statt unstable_retry()/reset() — bei
// Vercel 503 oder transientem Server-Fehler führt React-Recovery oft erneut
// zum gleichen Fehler. Full-Reload behält die aktuelle URL bei + Cookies
// bleiben erhalten → MA verliert keinen Lead-Arbeitsstand.
// „Zur Startseite"-Link entfernt — der redirected ohne Session auf /login,
// was bei einem transienten Server-Hick auf einer Lead-Seite nicht passt.

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="text-red-500 text-5xl mb-4">!</div>
        <h1 className="text-xl font-semibold text-claimondo-navy mb-2">
          Etwas ist schiefgelaufen
        </h1>
        <p className="text-claimondo-ondo text-sm mb-4">
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
        </p>
        <p className="text-claimondo-ondo text-xs mb-2 font-mono bg-white border border-claimondo-border rounded-lg px-4 py-3 text-left break-all">
          {error.message || 'Unbekannter Fehler'}
        </p>
        {error.digest && (
          <p className="text-claimondo-ondo/70 text-xs mb-4 font-mono">
            Fehler-ID: {error.digest}
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium rounded-xl transition-colors"
        >
          Seite neu laden
        </button>
      </div>
    </div>
  )
}
