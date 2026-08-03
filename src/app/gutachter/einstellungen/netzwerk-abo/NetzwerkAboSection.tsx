'use client'

// P5 T9: Einstellungen-Sektion „Netzwerkpartner" — Free -> Upgrade-CTA mit embedded
// Checkout (KFZ-156-Muster); zahlend -> Status + „Abo verwalten" (Stripe Customer Portal).
// Status-Anzeige = reine Label-Map (KEINE Farb-Map — Status-Registry-Gate).

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { NetzwerkpartnerCta } from '@/components/netzwerk/NetzwerkpartnerCta'
import { starteNetzwerkAboCheckout, oeffneAboPortal } from './actions'

const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv',
  comped: 'Aktiv (Partner-Konditionen)',
  ueberfaellig: 'Zahlung ausstehend',
  gekuendigt: 'Gekündigt',
  inaktiv: 'Inaktiv',
}

export function NetzwerkAboSection({
  aboStatus,
  gueltigBis,
  monatEuro,
  setupEuro,
  stripePublishableKey,
  checkoutSuccess,
}: {
  aboStatus: string | null
  gueltigBis: string | null
  monatEuro: string
  setupEuro: string
  stripePublishableKey: string
  checkoutSuccess: boolean
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const hatAbo = aboStatus === 'aktiv' || aboStatus === 'comped' || aboStatus === 'ueberfaellig'

  async function starteCheckout() {
    setLoading(true)
    setFehler(null)
    const res = await starteNetzwerkAboCheckout()
    setLoading(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    setClientSecret(res.clientSecret)
  }

  async function oeffnePortal() {
    setLoading(true)
    setFehler(null)
    const res = await oeffneAboPortal()
    if (!res.ok) {
      setLoading(false)
      setFehler(res.error)
      return
    }
    window.location.href = res.url
  }

  return (
    <div className="mt-5">
      {checkoutSuccess ? (
        <div className="mb-3 rounded-ios-md bg-success-soft text-success-strong px-4 py-3 text-sm">
          Willkommen im Netzwerk! Dein Netzwerkpartner-Abo ist eingerichtet — der Vorteil
          greift, sobald die erste Zahlung bestätigt ist (in der Regel sofort).
        </div>
      ) : null}

      {hatAbo ? (
        <SectionCard className="p-6">
          <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Netzwerkpartner</h2>
          <p className="text-sm text-claimondo-navy">
            Status: <span className="font-semibold">{STATUS_LABEL[aboStatus ?? ''] ?? aboStatus}</span>
            {gueltigBis && aboStatus !== 'comped' ? (
              <span className="text-claimondo-shield">
                {' '}
                · nächste Abrechnung {new Date(gueltigBis).toLocaleDateString('de-DE')}
              </span>
            ) : null}
          </p>
          {aboStatus === 'ueberfaellig' ? (
            <p className="text-body-xs text-warning-strong mt-1">
              Die letzte Zahlung ist offen — bitte aktualisiere deine Zahlungsmethode, damit dein
              Netzwerk-Vorteil aktiv bleibt.
            </p>
          ) : null}
          {aboStatus !== 'comped' ? (
            <div className="mt-4">
              <Button variant="ondo" size="sm" onClick={oeffnePortal} loading={loading}>
                Abo verwalten
              </Button>
            </div>
          ) : null}
          {fehler ? <p className="text-body-xs text-danger mt-2">{fehler}</p> : null}
        </SectionCard>
      ) : clientSecret && stripePublishableKey ? (
        <SectionCard className="p-6">
          <h2 className="text-sm font-medium text-claimondo-ondo mb-4">Netzwerkpartner werden</h2>
          <EmbeddedCheckoutProvider
            stripe={loadStripe(stripePublishableKey)}
            options={{ clientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </SectionCard>
      ) : (
        <>
          <NetzwerkpartnerCta
            monatEuro={monatEuro}
            setupEuro={setupEuro}
            onUpgrade={starteCheckout}
            loading={loading}
          />
          {fehler ? <p className="text-body-xs text-danger mt-2">{fehler}</p> : null}
        </>
      )}
    </div>
  )
}
