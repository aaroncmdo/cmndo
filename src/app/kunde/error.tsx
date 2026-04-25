'use client'

import ErrorState from '@/components/shared/ErrorState'

export default function KundeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <ErrorState
          title="Etwas ist schiefgelaufen"
          description="Wir wurden benachrichtigt und kümmern uns darum. Bitte versuche es erneut."
          error={error}
          retry={reset}
          retryLabel="Erneut versuchen"
        />
      </div>
    </div>
  )
}
