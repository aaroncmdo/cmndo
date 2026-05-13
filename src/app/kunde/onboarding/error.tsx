// Token-Audit-Skip: Error-Boundary lädt vor Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useEffect } from 'react'
import ErrorState from '@/components/shared/ErrorState'

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ONBOARDING ERROR BOUNDARY]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <ErrorState
          title="Onboarding konnte nicht geladen werden"
          description="Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt, kontaktieren Sie uns."
          error={error}
          retry={reset}
        />
      </div>
    </div>
  )
}
