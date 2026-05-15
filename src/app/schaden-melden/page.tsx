import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import { isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { MiniWizardClient } from './MiniWizardClient'

// AAR-904: /schaden-melden ist jetzt direkt der Mini-Wizard.
// Vorher: Redirect-Stub auf /schaden-melden/schritt-1 (alter 4-Step-Wizard).
// Aktuell: 4-Felder-Form, Magic-Link per dispatchMagicLink (WA bevorzugt,
// Email-Fallback).
//
// 15.05.2026 Promo-Attribution ohne Cookie: PR #1308 (page→setPromoCookie)
// und PR #1319 (page→prop→MiniWizardClient→useEffect→setPromoCookie) haben
// versucht, das Cookie-Pattern zu retten. Beide haben CMM-14-Crashes mit
// "Cookies can only be modified in a Server Action or Route Handler"
// erzeugt (Sentry NEXTJS-8/9 + Digests 890686022, 2237539019, 2740258766
// — drei verschiedene Stack-Frames). Diese Iteration entfernt den Cookie-
// Layer komplett: validated promo als Prop an MiniWizardClient → hidden
// FormData-Field → createLeadFromMiniWizard liest den Code direkt aus dem
// Input. Funktional identisch (Cookie wurde NUR für DIESE Anlage gelesen,
// keine Cross-Session-Attribution), architektonisch sauberer.

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
