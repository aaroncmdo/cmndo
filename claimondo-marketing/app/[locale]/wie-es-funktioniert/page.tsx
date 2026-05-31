import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import {
  Phone, MessageCircle, ChevronRight, Quote,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { FounderSection } from '@/components/landing/FounderSection'
import { SiebenFehlerSection } from '@/components/landing/SiebenFehlerSection'
import { PortalMockupSection } from '@/components/landing/sections/PortalMockupSection'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

// /wie-es-funktioniert — Premium-Layout. Conversion-Page mit Fokus auf
// Prozess + Portal + Berater + Trust-Anker. Folgt der Köln-Handoff-
// Prototype-Design-Philosophie.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('wie_es_funktioniert.title'),
    description: t('wie_es_funktioniert.description'),
    keywords: [
      'Kfz-Schaden melden', 'Unfallschaden online', 'Schadensregulierung Ablauf',
      'Gutachter Termin online', 'digitale Schadensregulierung', 'Schadenakte Portal',
      'Sachverständiger 48 Stunden', 'Anwalt Verkehrsunfall Ablauf',
    ],
    alternates: { canonical: '/wie-es-funktioniert', ...buildLanguageAlternates('/wie-es-funktioniert') },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/wie-es-funktioniert`,
      title: t('wie_es_funktioniert.title'),
      description: t('wie_es_funktioniert.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'So funktioniert Claimondo' }],
    },
  }
}

export default async function WieEsFunktioniertPage() {
  const t = await getTranslations('wie_es_funktioniert')

  type SchrittItem = { titel: string; text: string; detail: string }
  type FaqItem = { frage: string; antwort: string }

  const kpis = t.raw('kpis') as { wert: string; label: string }[]
  const schritteListe = t.raw('schritte_liste') as SchrittItem[]
  const faqs = t.raw('faqs') as FaqItem[]

  const faqsForSchema = faqs.map((f) => ({ frage: f.frage, antwort: f.antwort }))

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Vollständige Kfz-Schadensregulierung in 5 Schritten',
            description:
              'Vom unverschuldeten Unfall zur Auszahlung in durchschnittlich 32 Tagen. Berater-Rückruf <15 Min, DAT-Gutachter <48 h, Partnerkanzlei für Verkehrsrecht-Anwalt setzt Ansprüche durch. Live verfolgbar im Portal.',
            url: `${SITE_URL}/wie-es-funktioniert`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'Kfz-Schaden vollständig regulieren — vom Unfall bis zur Auszahlung',
            description:
              'In fünf Schritten vom unverschuldeten Unfall zur vollständigen Auszahlung. Durchschnittlich 32 Tage, ohne Eigenanteil.',
            totalTime: 'P32D',
            step: schritteListe.map((s, i) => ({
              '@type': 'HowToStep',
              position: i + 1,
              name: s.titel,
              text: s.text,
            })),
          },
          faqPageSchema(faqsForSchema),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Wie es funktioniert', url: '/wie-es-funktioniert' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* 1 — Hero */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="wef-hero">
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
          <h1 id="wef-hero" className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
            {t('hero.h1_plain')}<br />
            <span className="text-claimondo-light-blue">{t('hero.h1_accent')}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/80">
            {t('hero.sub')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-wef-melden"
            >
              {t('hero.cta_primary')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
              data-tracking="call-wef-hero"
            >
              <Phone className="h-5 w-5" aria-hidden />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* 2 — Trust-Strip (Zeit-KPIs) */}
      <TrustStripSection kpis={kpis} ariaLabel="Zeit-Kennzahlen" />

      {/* 3 — Die 5 Schritte (ausführlich, alternierend) */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="wef-schritte">
        <div className="mx-auto max-w-5xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('schritte.eyebrow')}
            </p>
            <h2 id="wef-schritte" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('schritte.heading')}
            </h2>
          </div>
          <ol className="mt-12 space-y-6" role="list">
            {schritteListe.map((s, i) => (
              <li
                key={i}
                className="relative grid gap-4 rounded-ios-lg border border-claimondo-border bg-white p-7 shadow-claimondo-sm sm:grid-cols-[auto_1fr] sm:gap-7"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-ios-md bg-claimondo-navy text-2xl font-extrabold text-white">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-claimondo-navy">{s.titel}</h3>
                  <p className="mt-2 text-base leading-relaxed text-claimondo-shield">{s.text}</p>
                  <p className="mt-3 text-sm leading-relaxed text-claimondo-shield/85">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 — Portal-Mockup */}
      <PortalMockupSection />

      {/* 5 — Berater-Quote */}
      <section className="bg-claimondo-navy py-16 text-white sm:py-20" aria-labelledby="wef-berater">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-ios-lg border border-white/10 shadow-claimondo-lg">
            <Image
              src="/marketing-landing-koeln/berater.png"
              alt={t('berater.foto_alt')}
              fill sizes="(max-width: 768px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              {t('berater.eyebrow')}
            </p>
            <h2 id="wef-berater" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              {t('berater.heading')}
            </h2>
            <Quote className="mt-6 h-8 w-8 text-claimondo-light-blue/60" aria-hidden />
            <blockquote className="mt-3 text-lg leading-relaxed text-white/85">
              {t('berater.blockquote')}
            </blockquote>
            <p className="mt-4 text-sm font-semibold text-claimondo-light-blue">
              {t('berater.byline')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
                data-tracking="call-wef-berater"
              >
                <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
                {PHONE_DISPLAY}
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
                data-tracking="whatsapp-wef-berater"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6 — Sieben Fehler */}
      <SiebenFehlerSection />

      {/* 7 — Gründer */}
      <FounderSection />

      {/* 8 — FAQ */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="wef-faq">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('faq.eyebrow')}
            </p>
            <h2 id="wef-faq" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('faq.heading')}
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details key={f.frage} className="group rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
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
              data-tracking="cta-wef-bottom"
            >
              {t('bottom_cta.cta_primary')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/vorteile"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
            >
              {t('bottom_cta.cta_secondary')}
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/60">
            {t('bottom_cta.mehr_pre')}{' '}
            <Link
              href="/kfz-gutachter/online-kfz-gutachten"
              className="font-semibold text-white/90 underline underline-offset-2 hover:text-white"
            >
              {t('bottom_cta.mehr_link')}
            </Link>
          </p>
        </div>
      </section>

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle="Wie es funktioniert" />
    </div>
  )
}
