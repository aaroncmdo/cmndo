'use client'

// Render-Wrapper fuer den beauftragung-Wizard (flag-gated /anfrage, ?wizard=v2).
// Promotet die Anfrage->Lead beim Mount (client-side useEffect — NICHT im Server-
// Render, sonst NEXTJS-8/9 no-cookie-context, s. feedback_inline_action_no_cookies),
// dann rendert der DynamicWizard mit flowKey='beauftragung'. Der Wizard selbst macht
// Save (speichereBeauftragungStep), Quali-Gate, Matching/Booking + SA/Finalize.

import { useEffect, useState } from 'react'
import { promoteAnfrageZuLead } from './actions'
import { WizardClient } from '@/components/onboarding/WizardClient'
import type { OnboardingPhase } from '@/components/onboarding/types'

export function BeauftragungWizardStart({
  token,
  phases,
}: {
  token: string
  phases: OnboardingPhase[]
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ab = false
    promoteAnfrageZuLead(token)
      .then((r) => {
        if (ab) return
        if (r.ok) setReady(true)
        else setError(r.error ?? 'Dieser Link ist nicht mehr gültig.')
      })
      .catch(() => {
        if (!ab) setError('Es ist ein Fehler aufgetreten. Bitte laden Sie die Seite neu.')
      })
    return () => {
      ab = true
    }
  }, [token])

  if (error) return <p className="text-center text-claimondo-navy/70">{error}</p>
  if (!ready) return <p className="text-center text-claimondo-navy/60">Einen Moment …</p>

  return <WizardClient flowKey="beauftragung" token={token} phases={phases} />
}
