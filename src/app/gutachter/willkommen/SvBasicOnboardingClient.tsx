'use client'

// Thin wrapper that mounts the generic WizardClient for the sv-onboarding flow.
// Shown for paket='basic' SVs who have not yet completed onboarding.
// No token/anfrage context — the save path writes directly onto sachverstaendige
// + profiles via speichereSvOnboardingStep (session-auth).
//
// P5 T8: Der Completed-Screen bekommt den optionalen Netzwerkpartner-Ask
// (completedExtra) — skippbar, der bestehende „Zum Portal"-Button bleibt der Skip.

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { WizardClient } from '@/components/onboarding/WizardClient'
import type { OnboardingPhase } from '@/components/onboarding/types'
import { NetzwerkpartnerCta } from '@/components/netzwerk/NetzwerkpartnerCta'
import { starteNetzwerkAboCheckout } from '@/app/gutachter/einstellungen/netzwerk-abo/actions'

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
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const netzwerkAsk = netzwerkMonatEuro ? (
    clientSecret && stripePublishableKey ? (
      <EmbeddedCheckoutProvider stripe={loadStripe(stripePublishableKey)} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    ) : (
      <>
        <NetzwerkpartnerCta
          monatEuro={netzwerkMonatEuro}
          setupEuro={netzwerkSetupEuro}
          loading={loading}
          onUpgrade={async () => {
            setLoading(true)
            setFehler(null)
            const res = await starteNetzwerkAboCheckout()
            setLoading(false)
            if (!res.ok) { setFehler(res.error); return }
            setClientSecret(res.clientSecret)
          }}
        />
        {fehler ? <p className="mt-2 text-body-xs text-danger">{fehler}</p> : null}
      </>
    )
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
          completedExtra={netzwerkAsk}
        />
      </div>
    </div>
  )
}
