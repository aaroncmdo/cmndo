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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="text-red-500 text-5xl mb-4">!</div>
        <h1 className="text-xl font-semibold text-white mb-2">
          Etwas ist schiefgelaufen
        </h1>
        <p className="text-zinc-400 text-sm mb-6">
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
        </p>
        {error.digest && (
          <p className="text-zinc-600 text-xs mb-4 font-mono">
            Fehler-ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => unstable_retry()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Erneut versuchen
          </button>
          <a
            href="/"
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl transition-colors"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    </div>
  )
}
