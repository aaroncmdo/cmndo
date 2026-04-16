'use client'

import { AlertTriangleIcon, RefreshCcwIcon } from 'lucide-react'

// AAR-271: window.location.reload() statt reset() — siehe globale error.tsx
export default function GutachterError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-12 text-center border border-red-900/30">
          <AlertTriangleIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-gray-900 text-lg font-semibold mb-2">Etwas ist schiefgelaufen</h2>
          <p className="text-gray-500 text-sm mb-2">Die Seite konnte nicht geladen werden.</p>
          {error.message && (
            <p className="text-red-400/70 text-xs mb-6 font-mono break-all max-w-md mx-auto">{error.message}</p>
          )}
          <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors">
            <RefreshCcwIcon className="w-4 h-4" /> Seite neu laden
          </button>
        </div>
      </div>
    </div>
  )
}
