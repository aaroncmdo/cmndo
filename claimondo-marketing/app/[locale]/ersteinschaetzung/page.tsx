import type { Metadata } from 'next'
import React from 'react'
import Link from 'next/link'
import { Brain, Camera, FileText, ChevronRight, Clock, Shield, Euro, CheckCircle2, Phone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { TrustBlock } from '@/components/landing/TrustBlock'
import { serviceSchema, howToSchema, breadcrumbsSchema, jsonLdScript, SITE_URL, PHONE_DISPLAY } from '@/lib/seo/jsonld'
import { localeAlternates } from '@/lib/seo/alternates'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('ersteinschaetzung.title'),
    description: t('ersteinschaetzung.description'),
    keywords: [
      'KI-Schadensbewertung',
      'Kfz-Schaden Ersteinschätzung',
      'Unfallschaden kostenlos prüfen',
      'Reparaturkosten berechnen',
      'Wiederbeschaffungswert',
      'Gutachten lohnt sich',
      'kostenlose Schadensbewertung',
      'KFZ Schaden Foto hochladen',
    ],
    alternates: await localeAlternates('/ersteinschaetzung'),
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/ersteinschaetzung`,
      title: t('ersteinschaetzung.og_title'),
      description: t('ersteinschaetzung.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'KI-Ersteinschätzung Claimondo' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ersteinschaetzung.title'),
      description: t('ersteinschaetzung.twitter_description'),
      images: ['/og-default.png'],
    },
  }
}

const ERGEBNIS_ICONS = [Euro, FileText, Shield, CheckCircle2, Clock]

const SCHRITTE_META: Array<{ nr: string; icon: React.ElementType }> = [
  { nr: '01', icon: Camera },
  { nr: '02', icon: Brain },
  { nr: '03', icon: FileText },
]

export default function ErsteinschaetzungPage() {
  const t = useTranslations('ersteinschaetzung')
  const ergebnisPunkte = t.raw('ergebnis_punkte') as string[]
  const schritte = t.raw('schritte') as Array<{ title: string; subtitle: string; text: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kostenlose KI-Ersteinschätzung Kfz-Schaden',
            description:
              'KI-basierte Sofortbewertung von Kfz-Unfallschäden. Fotos hochladen, in unter 15 Minuten erhalten Sie Reparaturkosten-Schätzung, Wiederbeschaffungswert und Gutachten-Empfehlung.',
            url: `${SITE_URL}/ersteinschaetzung`,
          }),
          howToSchema({
            name: 'Kfz-Schaden kostenlos ersteinschätzen lassen',
            description:
              'In 3 Schritten zur kostenlosen KI-Ersteinschätzung Ihres Kfz-Schadens.',
            totalTime: 'PT5M',
            estimatedCost: { currency: 'EUR', value: '0' },
            schritte: [
              {
                name: 'Fotos und Unfallbeschreibung hochladen',
                text: 'Fotografieren Sie den Schaden aus verschiedenen Winkeln. Beschreiben Sie Unfallhergang und Fahrzeug in wenigen Sätzen. Dauer: ca. 5 Minuten, keine Anmeldung erforderlich.',
              },
              {
                name: 'KI analysiert den Schaden',
                text: 'Unsere KI analysiert Fotos und Beschreibung und liefert in Sekunden eine Kostenindikation sowie die Einschätzung ob ein DAT-Gutachten sinnvoll ist.',
              },
              {
                name: 'Ersteinschätzung und Handlungsempfehlung erhalten',
                text: 'Sie erhalten geschätzte Reparaturkosten, Wiederbeschaffungswert und die Empfehlung: Kostenvoranschlag oder unabhängiges Gutachten. Bei Bedarf vermitteln wir sofort einen Sachverständigen.',
              },
            ],
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'KI-Ersteinschätzung', url: '/ersteinschaetzung' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />

      {/* Hero — Navy Premium-Pattern */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="ee-hero">
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
        <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md sm:text-sm">
            <Brain className="h-3.5 w-3.5" aria-hidden />
            {t('hero_badge')}
          </div>
          <h1
            id="ee-hero"
            className="mt-5 text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('hero_h1_line1')}{' '}
            <span className="text-claimondo-light-blue">{t('hero_h1_line2')}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-white/80 sm:text-lg">
            {t('hero_intro')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-ee-melden"
            >
              {t('hero_cta_primary')}
              <ChevronRight className="h-5 w-5" aria-hidden />
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
              data-tracking="call-ee-hero"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* Trust-Strip */}
      <TrustStripSection
        ariaLabel="KI-Kennzahlen"
        kpis={[
          { wert: t('trust_kpi_0_wert'), label: t('trust_kpi_0_label') },
          { wert: t('trust_kpi_1_wert'), label: t('trust_kpi_1_label') },
          { wert: t('trust_kpi_2_wert'), label: t('trust_kpi_2_label') },
          { wert: t('trust_kpi_3_wert'), label: t('trust_kpi_3_label') },
        ]}
      />

      {/* Direkt-Antwort */}
      <section className="pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <AnswerCapsule quelle={t('antwort_capsule_quelle')}>
            {t.rich('antwort_p', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AnswerCapsule>
        </div>
      </section>

      {/* Was Sie bekommen */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-ios-lg p-8">
            <h2
              className="mb-6 text-2xl font-bold text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              {t('ergebnis_h2')}
            </h2>
            <ul className="space-y-4">
              {ergebnisPunkte.map((text, i) => {
                const Icon = ERGEBNIS_ICONS[i]
                return (
                  <li key={text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                      <Icon className="h-4 w-4 text-claimondo-ondo" />
                    </div>
                    <span className="text-base text-claimondo-shield">{text}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* Wie es funktioniert */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2
            className="mb-10 text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('schritte_h2')}
          </h2>
          <div className="space-y-6">
            {schritte.map((schritt, i) => {
              const meta = SCHRITTE_META[i]
              const Icon = meta.icon
              return (
                <div
                  key={meta.nr}
                  className="flex items-start gap-6 rounded-ios-lg border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md sm:p-7"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div className="flex-shrink-0">
                    <div className="flex h-14 w-14 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                      <Icon className="h-7 w-7 text-claimondo-ondo" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black text-claimondo-border">{meta.nr}</span>
                      <div>
                        <h3 className="text-lg font-bold text-claimondo-navy">{schritt.title}</h3>
                        <p className="text-sm font-semibold text-claimondo-ondo">{schritt.subtitle}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{schritt.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Ab 750 € Info-Box */}
      <section className="py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-ios-lg border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6">
            <h3 className="mb-2 font-bold text-claimondo-navy">
              {t('info_h3')}
            </h3>
            <p className="text-sm leading-relaxed text-claimondo-shield">
              {t('info_p')}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 25% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 75% 80%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-2xl px-4">
          <h2
            className="text-3xl font-bold text-white sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('cta_h2')}
          </h2>
          <p className="mt-3 text-lg text-white/65">
            {t('cta_sub')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              {t('cta_primary')}
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <TrustBlock
        stats={[
          { wert: t('trust_stat_0_wert'), label: t('trust_stat_0_label') },
          { wert: t('trust_stat_1_wert'), label: t('trust_stat_1_label') },
          { wert: t('trust_stat_2_wert'), label: t('trust_stat_2_label') },
          { wert: t('trust_stat_3_wert'), label: t('trust_stat_3_label') },
        ]}
      />

      <LandingFooter />
      <StickyCallBar quelle="Ersteinschätzung" />
    </div>
  )
}
