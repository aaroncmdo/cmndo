'use client'

import ErrorState from '@/components/shared/ErrorState'

// AAR-271: window.location.reload() statt reset() — siehe globale error.tsx
// AAR-414: auf ErrorState-Primitive migriert
export default function SachverstaendigeError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <ErrorState
          title="Fehler beim Laden"
          description="Die Sachverständigen-Seite konnte nicht geladen werden."
          error={error}
        />
      </div>
    </div>
  )
}
