'use client'

import { useState } from 'react'

interface Props {
  abrechnungId: string
  token: string
  endbetragBrutto: number
  status: string
  checkoutAction: (abrechnungId: string, token: string) => Promise<{ url: string } | { error: string }>
}

/**
 * KFZ-188: Client-Komponente fuer den Kanzlei-Checkout-Button.
 * Ruft per Server Action eine Stripe Checkout Session ab und redirected.
 */
export default function KanzleiCheckoutClient({ abrechnungId, token, endbetragBrutto, status, checkoutAction }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'bezahlt' || status === 'storniert') return null

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const result = await checkoutAction(abrechnungId, token)
      if ('error' in result) {
        setError(result.error)
        setLoading(false)
        return
      }
      window.location.href = result.url
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider mb-4">Zahlung</h2>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Fehler: {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-claimondo-ondo text-sm">Gesamtbetrag</p>
          <p className="text-2xl font-bold text-claimondo-navy">{endbetragBrutto.toFixed(2).replace('.', ',')} €</p>
          <p className="text-xs text-claimondo-ondo/70">inkl. 19 % MwSt.</p>
        </div>
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="px-8 py-3 bg-claimondo-navy text-white font-semibold rounded-xl hover:bg-claimondo-shield transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Weiterleitung...' : 'Jetzt bezahlen'}
        </button>
      </div>
      <p className="text-xs text-claimondo-ondo/70 mt-3">
        Sichere Zahlung via Stripe. Sie werden auf die Stripe-Zahlungsseite weitergeleitet.
      </p>
    </div>
  )
}
