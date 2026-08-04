'use client'

// P5 T8-Fix (04.08.): Der Netzwerkpartner-Ask mit inline embedded Checkout als
// eigenstaendige Client-Komponente — extrahiert aus SvBasicOnboardingClient,
// damit auch der Server-Screen SvBasicPendingReview ihn rendern kann (dort war
// der Ask vorher UNERREICHBAR: finalize -> revalidate ersetzte den Wizard-
// Completed-Screen serverseitig, bevor der Ask je sichtbar wurde).

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { NetzwerkpartnerCta } from '@/components/netzwerk/NetzwerkpartnerCta'
import { starteNetzwerkAboCheckout } from '@/app/gutachter/einstellungen/netzwerk-abo/actions'

export function NetzwerkAskInline({
  monatEuro,
  setupEuro,
  stripePublishableKey,
}: {
  /** Formatierter Monatspreis (leer = Ask nicht rendern — Caller gated). */
  monatEuro: string
  setupEuro: string
  stripePublishableKey: string
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  if (!monatEuro) return null

  if (clientSecret && stripePublishableKey) {
    return (
      <EmbeddedCheckoutProvider stripe={loadStripe(stripePublishableKey)} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    )
  }

  return (
    <>
      <NetzwerkpartnerCta
        monatEuro={monatEuro}
        setupEuro={setupEuro}
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
}
