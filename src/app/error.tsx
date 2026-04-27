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
    <div className="min-h-screen bg-white p-6 font-mono text-xs text-black">
      <h1 className="text-red-700 text-sm font-bold mb-2">
        /app root crash — CMM-14 diagnose
      </h1>
      <div className="mb-2"><strong>Message:</strong> {error.message || '(leer)'}</div>
      <div className="mb-2"><strong>Digest:</strong> {error.digest || '(keiner)'}</div>
      <div className="mb-2"><strong>Name:</strong> {error.name}</div>
      <pre className="bg-gray-100 p-3 rounded overflow-auto max-h-[400px] whitespace-pre-wrap break-all text-[10px]">
        {error.stack || '(kein Stack)'}
      </pre>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded text-xs"
      >
        Seite neu laden
      </button>
    </div>
  )
}
