import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { campaignSourceChannel } from '@/lib/flow/campaign-source'
import { MiniWizardClient } from './MiniWizardClient'
import { SheetCard } from '@/components/shared/SheetCard'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { TrustBlock } from '@/components/landing/TrustBlock'
import { BeratungVereinbarenButton } from '@/components/shared/glass'
import { localeAlternates } from '@/lib/seo/alternates'

// AAR-904: /schaden-melden ist der Mini-Wizard (4 Felder, Magic-Link via
// dispatchMagicLink, WA bevorzugt + Email-Fallback).
//
// Design-Angleichung (26.06.): vorher eine nackte Form-Card ohne Marketing-Chrome
// (kein Topbar/Footer/Hero/Trust) -> wirkte wie eine verwaiste App-Seite. Jetzt
// strukturgleich zu /check (Topbar, Hero mit Gradient-Ambient + Trust-Badge,
// SheetCard, Rueckruf-Alternativ, TrustBlock, Footer) -> konsistent
// mit dem Rest der Webseite.
//
// UX-Audit (04.07.): StickyCallBar HIER entfernt — auf der Konversions-Formularseite
// konkurrierte die Sticky-Bar (rivalisierendes "Gutachter finden" + lautes "Sofort
// anrufen") mit dem Formular-Absenden. Rueckruf-Lifeline bleibt inline (BeratungVereinbaren).
//
// Promo-Attribution (15.05.): ?p=<code> -> Prop -> hidden field in MiniWizardClient.
// Kampagnen-Attribution (26.06.): ?src=<slug> -> source_channel ('kampagne-<slug>'),
// fuer Self-Service (MiniWizardClient) UND Rueckruf (quelle).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('schaden_melden.title'),
    description: t('schaden_melden.description'),
    alternates: await localeAlternates('/schaden-melden'),
  }
}

export default async function SchadenMeldenPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; src?: string }>
}) {
  const { p, src } = await searchParams
  const initialPromo = p && isValidPromoCodeFormat(p) ? p : null
  // QR-Kampagnen-Tag aus ?src=<slug> -> via hidden field an die Server-Action
  // (Self-Service) bzw. als Rueckruf-quelle. Sanitisierung in campaignSourceChannel().
  const initialSrc = typeof src === 'string' ? src : null
  const rueckrufQuelle = campaignSourceChannel(initialSrc, 'schaden-melden-rueckruf')

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />

      {/* Hero – gleiche Sprache wie /check: Gradient-Ambient + Trust-Badge */}
      <section className="relative isolate overflow-hidden py-12 text-center sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 20% 15%, rgba(123,163,204,0.22), transparent 50%)',
              'radial-gradient(circle at 85% 35%, rgba(69,115,162,0.14), transparent 45%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Kostenlos &amp; unverbindlich
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Ihren Schaden in wenigen Minuten melden
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-claimondo-ondo sm:text-lg">
            Drei kurze Fragen, dann kommt Ihr sicherer Link per WhatsApp oder E-Mail.
            Dort wählen Sie den Gutachter-Termin und unterschreiben die Vollmacht – alles Weitere koordinieren wir.
          </p>
        </div>
      </section>

      {/* Formular */}
      <section className="pb-12">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <SheetCard size="full" padding="md" animateIn={false} className="sm:p-10">
            <MiniWizardClient initialPromo={initialPromo} initialSrc={initialSrc} />
          </SheetCard>
        </div>
      </section>

      {/* Alternativ: Rückruf statt Self-Service (kampagnen-getaggt via quelle) */}
      <section className="pb-14">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-3 rounded-ios-lg border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6 text-center">
            <p className="text-sm text-claimondo-shield">
              Keine Zeit für das Formular? Ein Berater ruft Sie zurück, meist in 15 Minuten.
            </p>
            <BeratungVereinbarenButton quelle={rueckrufQuelle} label="Rückruf anfordern" />
          </div>
        </div>
      </section>

      <TrustBlock />

      <LandingFooter />
    </div>
  )
}
