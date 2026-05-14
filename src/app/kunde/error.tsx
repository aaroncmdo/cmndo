// Token-Audit-Skip: Error-Boundary lädt vor Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useEffect } from 'react'
import ErrorState from '@/components/shared/ErrorState'

export default function KundeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[KUNDE LAYOUT ERROR BOUNDARY]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <ErrorState
          title="Etwas ist schiefgelaufen"
          description="Wir konnten Ihren Bereich nicht laden. Versuchen Sie es bitte erneut."
          error={error}
          retry={reset}
        />
      </div>
    </div>
  )
}
