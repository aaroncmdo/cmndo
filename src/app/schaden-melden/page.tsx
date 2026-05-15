import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import { isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { setPromoCookie } from '@/lib/flow/promo-cookie-action'
import { MiniWizardClient } from './MiniWizardClient'

// AAR-904: /schaden-melden ist jetzt direkt der Mini-Wizard.
// Vorher: Redirect-Stub auf /schaden-melden/schritt-1 (alter 4-Step-Wizard).
// Aktuell: 4-Felder-Form, Magic-Link per dispatchMagicLink (WA bevorzugt,
// Email-Fallback). Promo-Cookie-Attribution bleibt unveraendert.

export const metadata: Metadata = {
  title: 'Schaden melden — Sicherer Login-Link',
  description:
    'In 30 Sekunden Schaden melden. Sie erhalten direkt einen sicheren Login-Link per WhatsApp oder E-Mail.',
}

export default async function SchadenMeldenPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>
}) {
  // Promo-Code-Attribution (AAR-467 C1): ?p=<code> → Cookie
  // 15.05.2026: setPromoCookie ist eine 'use server'-Action, weil cookies().set()
  // in Server-Components verboten ist (Next 15+). Vorher: APP ROOT CRASH
  // (CMM-14 diag, digest 890686022) bei jedem valid promo-Code auf der Route.
  const { p } = await searchParams
  if (p && isValidPromoCodeFormat(p)) {
    await setPromoCookie(p)
  }

  return (
    <div className="min-h-screen bg-claimondo-bg py-10">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6">
          <PageHeader
            title="Schaden melden"
            description="Drei Fragen, dann erhalten Sie per WhatsApp oder E-Mail einen sicheren Login-Link. Dort unterschreiben Sie SA + Vollmacht — wir kümmern uns um den Rest."
            size="lg"
          />
        </div>
        <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 shadow-claimondo-md sm:p-8">
          <MiniWizardClient />
        </div>
      </div>
    </div>
  )
}
