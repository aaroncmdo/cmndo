// AAR-414: Zentrale Error-State-Primitive. Für error.tsx-Boundaries +
// API-Fehler. Ähnliches Layout wie EmptyState, rote Farbwelt + Retry-CTA.
// Ergänzt bestehende ErrorBoundary.tsx — diese bleibt für React-Error-
// Catching, ErrorState ist das UI dafür.

'use client'

import { AlertTriangleIcon, RefreshCcwIcon } from 'lucide-react'

export interface ErrorStateProps {
  title?: string
  description?: string
  error?: Error | { message?: string } | null
  retry?: () => void
  retryLabel?: string
  className?: string
}

export default function ErrorState({
  title = 'Etwas ist schiefgelaufen',
  description = 'Die Seite konnte nicht geladen werden.',
  error,
  retry,
  retryLabel = 'Erneut versuchen',
  className = '',
}: ErrorStateProps) {
  const handleRetry = retry ?? (() => {
    if (typeof window !== 'undefined') window.location.reload()
  })

  return (
    <div
      className={`bg-white rounded-2xl p-12 text-center border border-red-200 ${className}`}
    >
      <AlertTriangleIcon
        className="w-10 h-10 text-red-400 mx-auto mb-3"
        strokeWidth={1.5}
      />
      <h2 className="text-gray-900 text-base font-semibold mb-1">{title}</h2>
      <p className="text-gray-500 text-sm">{description}</p>
      {error?.message && (
        <p className="text-red-400/70 text-xs mt-3 font-mono break-all max-w-md mx-auto">
          {error.message}
        </p>
      )}
      <button
        type="button"
        onClick={handleRetry}
        className="inline-flex items-center gap-2 bg-[#0D1B3E] hover:bg-[#4573A2] text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors mt-5"
      >
        <RefreshCcwIcon className="w-4 h-4" />
        {retryLabel}
      </button>
    </div>
  )
}
