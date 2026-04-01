'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="text-red-500 text-5xl mb-4">!</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Etwas ist schiefgelaufen
        </h1>
        <p className="text-gray-500 text-sm mb-4">
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
        </p>
        <p className="text-gray-500 text-xs mb-2 font-mono bg-white border border-gray-200 rounded-lg px-4 py-3 text-left break-all">
          {error.message || 'Unbekannter Fehler'}
        </p>
        {error.digest && (
          <p className="text-gray-400 text-xs mb-4 font-mono">
            Fehler-ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => unstable_retry()}
            className="px-5 py-2.5 bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium rounded-xl transition-colors"
          >
            Erneut versuchen
          </button>
          <a
            href="/"
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-xl transition-colors"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    </div>
  )
}
