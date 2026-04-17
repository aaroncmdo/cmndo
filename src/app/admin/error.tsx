'use client'

import ErrorState from '@/components/shared/ErrorState'

// AAR-271: window.location.reload() statt reset() — siehe globale error.tsx
// AAR-414: auf ErrorState-Primitive migriert
export default function AdminError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <ErrorState error={error} retryLabel="Seite neu laden" />
      </div>
    </div>
  )
}
