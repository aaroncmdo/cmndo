import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import { isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { MiniWizardClient } from './MiniWizardClient'

// AAR-904: /schaden-melden ist jetzt direkt der Mini-Wizard.
// Vorher: Redirect-Stub auf /schaden-melden/schritt-1 (alter 4-Step-Wizard).
// Aktuell: 4-Felder-Form, Magic-Link per dispatchMagicLink (WA bevorzugt,
// Email-Fallback). Promo-Cookie-Attribution bleibt unveraendert.
//
// 15.05.2026 Follow-up — Sentry NEXTJS-8/9: Auch die Server-Action-Variante
// (PR #1308) throwt weiter "Cookies can only be modified in a Server Action
// or Route Handler", weil ein `await setPromoCookie(p)` aus dem Render-Pfad
// einer Server-Component KEINEN Action-POST-Context bekommt. Cookie-Set
// klappt nur, wenn die Action über einen echten Client→Server-POST aufgerufen
// wird. Lösung: validated promo als Prop an MiniWizardClient durchreichen;
// der Client ruft setPromoCookie per useEffect auf — dort POST-Action-
// Context, Cookie-Set erlaubt.

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
  const { p } = await searchParams
  const initialPromo = p && isValidPromoCodeFormat(p) ? p : null

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
          <MiniWizardClient initialPromo={initialPromo} />
        </div>
      </div>
    </div>
  )
}
