import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Phone, CheckCircle2, MessageCircle, ChevronRight, Euro, Scale,
  ShieldCheck, Zap, Clock, Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { VersichererTaktikenSection } from '@/components/landing/VersichererTaktikenSection'
import { SiebenFehlerSection } from '@/components/landing/SiebenFehlerSection'
import { WertminderungSandenDannerSection } from '@/components/landing/sections/WertminderungSandenDannerSection'
import { TeslaEAutoSection } from '@/components/landing/sections/TeslaEAutoSection'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { localeAlternates } from '@/lib/seo/alternates'

// /vorteile — Premium-Layout. Conversion-Page mit Fokus auf USPs + BGH-
// Authority + Versicherer-Kürzungs-Konter + Wissensdatenbank-Tiefe.
// Folgt der Köln-Handoff-Prototype-Design-Philosophie.

// Icons lokal — gleiche Reihenfolge wie vorteile.vorteile in de.json.
const VORTEIL_ICONS: LucideIcon[] = [Euro, Scale, ShieldCheck, Zap, Clock, Users]

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('vorteile.title'),
    description: t('vorteile.description'),
    keywords: [
      'Vorteile Kfz-Schaden', 'unabhängiger Gutachter', 'Wertminderung sichern',
      'UPE-Aufschläge', 'Mehrwertsteuer §249 BGB', 'Anwalt Verkehrsunfall',
      'HIS-Datei Schaden', 'volle Schadensregulierung', 'Quotenvorrecht',
    ],
    alternates: await localeAlternates('/vorteile'),
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/vorteile`,
      title: t('vorteile.title'),
      description: t('vorteile.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Vorteile Claimondo' }],
    },
  }
}

export default async function VorteilePage() {
  const t = await getTranslations('vorteile')

  type VorteilItem = { titel: string; sub: string; text: string; punkte: string[] }
  type FaqItem = { frage: string; antwort: string }

  const vorteile = t.raw('vorteile') as VorteilItem[]
  const kpis = t.raw('kpis') as { wert: string; label: string }[]
  const faqs = t.raw('faqs') as FaqItem[]

  // JSON-LD FAQs use the same data from de.json
  const faqsForSchema = faqs.map((f) => ({ frage: f.frage, antwort: f.antwort }))

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Vollständige Kfz-Schadensregulierung mit unabhängigem Sachverständigen',
            description:
              'Versicherer-Prüfdienste kürzen typischerweise 30–40 % der Ansprüche (NDR/Verbraucherzentrale/BGH VI ZR 38/22 ff.). Claimondo holt sie zurück: 0 € Eigenanteil nach §249 BGB, DAT-Gutachter + Partnerkanzlei für Verkehrsrecht inklusive. Vollständige BGH-konforme Durchsetzung.',
            url: `${SITE_URL}/vorteile`,
          }),
          faqPageSchema(faqsForSchema),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Vorteile', url: '/vorteile' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* 1 — Hero (kein Lead-Form, dual-CTA) */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="vorteile-hero">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-5xl px-5 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
            {t('hero.badge')}
          </div>
          <h1 id="vorteile-hero" className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
            {t('hero.h1_plain')}<span className="text-claimondo-light-blue">{t('hero.h1_accent')}</span>{t('hero.h1_suffix')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/80">
            {t('hero.sub')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-vorteile-melden"
            >
              {t('hero.cta_primary')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
              data-tracking="call-vorteile-hero"
              aria-label={t('hero.cta_call_aria')}
            >
              <Phone className="h-5 w-5" aria-hidden />
              {PHONE_DISPLAY}
            </a>
          </div>
          <p className="mt-5 text-xs text-white/55">
            {t('hero.trust_footer')}
          </p>
        </div>
      </section>

      {/* 2 — Trust-Strip */}
      <TrustStripSection kpis={kpis} methodikNote={t('kpi_methodik')} />

      {/* 3 — Die 6 Vorteile (Cards mit Bullets) */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="vorteile-grid">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('grid.eyebrow')}
            </p>
            <h2 id="vorteile-grid" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('grid.heading')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
              {t('grid.sub')}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vorteile.map((v, i) => {
              const Icon = VORTEIL_ICONS[i]
              return (
                <article
                  key={v.titel}
                  className="flex flex-col rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:shadow-claimondo-md"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                      <Icon className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-bold leading-tight text-claimondo-navy">{v.titel}</h3>
                      <p className="text-xs font-semibold text-claimondo-ondo">{v.sub}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-claimondo-shield">{v.text}</p>
                  <ul className="mt-4 space-y-1.5">
                    {v.punkte.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-xs text-claimondo-shield">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* 4 — Versicherer-Taktiken */}
      <VersichererTaktikenSection />

      {/* 5 — Wertminderung-Sanden/Danner */}
      <WertminderungSandenDannerSection />

      {/* 6 — Sieben Fehler vermeiden */}
      <SiebenFehlerSection />

      {/* 7 — Tesla / E-Auto */}
      <TeslaEAutoSection />

      {/* 8 — FAQ */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="vorteile-faq">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('faq.eyebrow')}
            </p>
            <h2 id="vorteile-faq" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('faq.heading')}
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details key={f.frage} className="group rounded-ios-md border border-claimondo-border bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-claimondo-navy">
                  <span>{f.frage}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9 — Bottom CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            {t('bottom_cta.heading')}
          </h2>
          <p className="mt-4 text-white/75">
            {t('bottom_cta.sub')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-vorteile-bottom"
            >
              {t('bottom_cta.cta_primary')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={WHATSAPP_HREF}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
              data-tracking="whatsapp-vorteile-bottom"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              WhatsApp
            </a>
          </div>
          <p className="mt-6 text-sm text-white/60">
            {t('bottom_cta.vergleich_pre')}{' '}
            <Link
              href="/kfz-gutachter/vermittlungsportale-vergleich"
              className="font-semibold text-white/90 underline underline-offset-2 hover:text-white"
            >
              {t('bottom_cta.vergleich_link')}
            </Link>
          </p>
        </div>
      </section>

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle="Vorteile" />
    </div>
  )
}
