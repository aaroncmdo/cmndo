'use client'

// Thin wrapper that mounts the generic WizardClient for the sv-onboarding flow.
// Shown for paket='basic' SVs who have not yet completed onboarding.
// No token/anfrage context — the save path writes directly onto sachverstaendige
// + profiles via speichereSvOnboardingStep (session-auth).

import { WizardClient } from '@/components/onboarding/WizardClient'
import type { OnboardingPhase } from '@/components/onboarding/types'

interface Props {
  phasen: OnboardingPhase[]
  svId: string
  prefilledValues?: Record<string, unknown>
}

export function SvBasicOnboardingClient({ phasen, svId: _svId, prefilledValues }: Props) {
  return (
    <div className="min-h-screen bg-claimondo-bg py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo mb-1">
            Kostenlos starten
          </p>
          <h1 className="text-3xl font-extrabold text-claimondo-navy leading-tight">
            Willkommen bei Claimondo
          </h1>
          <p className="mt-2 text-claimondo-navy/70 text-base">
            Dein Onboarding — nur wenige Schritte bis zu deinem ersten Auftrag.
          </p>
        </div>

        <WizardClient
          flowKey="sv-onboarding"
          phases={phasen}
          prefilledValues={prefilledValues}
          fallId={null}
          zb1Token={null}
          token={null}
        />
      </div>
    </div>
  )
}
