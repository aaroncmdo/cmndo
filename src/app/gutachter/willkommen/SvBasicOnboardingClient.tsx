'use client'

// Thin wrapper that mounts the generic WizardClient for the sv-onboarding flow.
// Shown for paket='basic' SVs who have not yet completed onboarding.
// No token/anfrage context — the save path writes directly onto sachverstaendige
// + profiles via speichereSvOnboardingStep (session-auth).
//
// P5 T8: Der Completed-Screen bekommt den optionalen Netzwerkpartner-Ask
// (completedExtra) — skippbar, der bestehende „Zum Portal"-Button bleibt der Skip.

import { WizardClient } from '@/components/onboarding/WizardClient'
import type { OnboardingPhase } from '@/components/onboarding/types'
import { NetzwerkAskInline } from '@/components/netzwerk/NetzwerkAskInline'

interface Props {
  phasen: OnboardingPhase[]
  svId: string
  prefilledValues?: Record<string, unknown>
  /** P5 T8: formatierte Netzwerkpartner-Preise (leer = kein Ask). */
  netzwerkMonatEuro?: string
  netzwerkSetupEuro?: string
  stripePublishableKey?: string
}

export function SvBasicOnboardingClient({
  phasen,
  svId: _svId,
  prefilledValues,
  netzwerkMonatEuro = '',
  netzwerkSetupEuro = '',
  stripePublishableKey = '',
}: Props) {
  // P5 T8-Fix (04.08.): Ask in NetzwerkAskInline extrahiert (geteilt mit
  // SvBasicPendingReview — dort ist der Ask nach finalize der einzig
  // erreichbare Ort, s. Kommentar in der Komponente).
  const netzwerkAsk = netzwerkMonatEuro ? (
    <NetzwerkAskInline
      monatEuro={netzwerkMonatEuro}
      setupEuro={netzwerkSetupEuro}
      stripePublishableKey={stripePublishableKey}
    />
  ) : null

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
            Ihr Onboarding — nur wenige Schritte bis zu Ihrem ersten Auftrag.
          </p>
        </div>

        <WizardClient
          flowKey="sv-onboarding"
          phases={phasen}
          prefilledValues={prefilledValues}
          fallId={null}
          zb1Token={null}
          token={null}
          completedExtra={netzwerkAsk}
        />
      </div>
    </div>
  )
}
