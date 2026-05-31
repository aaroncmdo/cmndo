import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, Mail, MessageCircle, ChevronRight, Clock, Shield, Users, CheckCircle2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { TrustBlock } from '@/components/landing/TrustBlock'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, CONTACT_EMAIL, WHATSAPP_HREF, WHATSAPP_E164 } from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('beratung_anfragen.title'),
    description: t('beratung_anfragen.description'),
    keywords: [
      'Kfz-Schaden Beratung kostenlos',
      'Unfallschaden Beratung',
      'Schadensberatung anfragen',
      'Verkehrsunfall Beratung',
      'kostenloses Erstgespräch',
      'Kfz-Anwalt Beratung',
      'Sachverständiger Beratung',
    ],
    alternates: {
      canonical: '/beratung-anfragen',
      ...buildLanguageAlternates('/beratung-anfragen'),
    },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/beratung-anfragen`,
      title: t('beratung_anfragen.title'),
      description: t('beratung_anfragen.og_description'),
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Beratung anfragen Claimondo' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('beratung_anfragen.twitter_title'),
      description: t('beratung_anfragen.twitter_description'),
      images: ['/og-default.png'],
    },
  }
}

const KONTAKT_ICONS = [Phone, MessageCircle, Mail] as const
const VERTRAUENS_ICONS = [Clock, Shield, Users, CheckCircle2] as const

export default async function BeratungAnfragenPage() {
  const t = await getTranslations('beratung_anfragen')

  const kontaktOptionen = t.raw('kontakt_optionen') as Array<{
    title: string
    subtitle: string
    text: string
    action_label: string
    action_label_prefix?: string
  }>
  const vertrauensPunkte = t.raw('vertrauens_punkte') as string[]
  const trustStats = t.raw('trust_stats') as Array<{ wert: string; label: string }>

  const KONTAKT_DATA = [
    {
      icon: KONTAKT_ICONS[0],
      title: kontaktOptionen[0]?.title ?? '',
      subtitle: kontaktOptionen[0]?.subtitle ?? '',
      text: kontaktOptionen[0]?.text ?? '',
      action: { label: `${PHONE_DISPLAY} ${kontaktOptionen[0]?.action_label ?? ''}`, href: `tel:${PHONE_E164}` },
    },
    {
      icon: KONTAKT_ICONS[1],
      title: kontaktOptionen[1]?.title ?? '',
      subtitle: kontaktOptionen[1]?.subtitle ?? '',
      text: kontaktOptionen[1]?.text ?? '',
      action: { label: kontaktOptionen[1]?.action_label ?? '', href: WHATSAPP_HREF },
    },
    {
      icon: KONTAKT_ICONS[2],
      title: kontaktOptionen[2]?.title ?? '',
      subtitle: kontaktOptionen[2]?.subtitle ?? '',
      text: kontaktOptionen[2]?.text ?? '',
      action: { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
    },
  ]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kostenlose Kfz-Schadensberatung',
            description:
              'Unverbindliche Erstberatung zu Kfz-Unfallschäden durch das Claimondo-Team. Erreichbar per Telefon, WhatsApp und E-Mail. Antwort in unter 15 Minuten.',
            url: `${SITE_URL}/beratung-anfragen`,
          }),
          // AAR-881: Page-spezifischer LocalBusiness-Block mit allen drei
          // Kontaktkanälen — gibt SERP-Knowledge-Panel + Telefon-Snippet die
          // ContactPoints, die nicht im globalen Layout-Schema stehen.
          // @id verkettet mit dem globalen LocalBusiness im Root-Layout.
          {
            '@context': 'https://schema.org',
            '@type': 'LegalService',
            '@id': `${SITE_URL}/#localbusiness`,
            name: 'Claimondo Schadensberatung',
            url: `${SITE_URL}/beratung-anfragen`,
            areaServed: { '@type': 'Country', name: 'Deutschland' },
            contactPoint: [
              {
                '@type': 'ContactPoint',
                contactType: 'customer service',
                telephone: PHONE_E164,
                email: CONTACT_EMAIL,
                areaServed: 'DE',
                availableLanguage: ['de', 'en', 'tr', 'ar', 'pl', 'ru'],
                hoursAvailable: [
                  {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                    opens: '08:00',
                    closes: '18:00',
                  },
                ],
              },
              {
                '@type': 'ContactPoint',
                contactType: 'customer service',
                telephone: WHATSAPP_E164,
                url: WHATSAPP_HREF,
                areaServed: 'DE',
                availableLanguage: ['de'],
                // WhatsApp: Antwort < 15 Min während Geschäftszeiten.
              },
            ],
          },
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Beratung anfragen', url: '/beratung-anfragen' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden py-16 text-center sm:py-20">
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
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm">
            {t('badge')}
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('h1')}
          </h1>
          <p className="mt-5 text-balance text-base text-claimondo-ondo sm:text-lg">
            {t('sub')}
          </p>
          <p className="mt-4 text-balance text-xs text-claimondo-shield/70 sm:text-sm">
            {t('disclaimer')}
          </p>
        </div>
      </section>

      {/* Direkt-Antwort */}
      <section className="pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <AnswerCapsule quelle={t('answer_capsule.quelle')}>
            <strong>{t('answer_capsule.text_strong')}</strong>
            {t('answer_capsule.text_body')}
          </AnswerCapsule>
        </div>
      </section>

      {/* Kontakt-Optionen */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2
            className="mb-8 text-center text-2xl font-bold text-claimondo-navy sm:text-3xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('kontakt_heading')}
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {KONTAKT_DATA.map((o) => {
              const Icon = o.icon
              return (
                <div
                  key={o.title}
                  className="flex flex-col rounded-ios-lg border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                    <Icon className="h-6 w-6 text-claimondo-ondo" />
                  </div>
                  <h3
                    className="text-lg font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {o.title}
                  </h3>
                  <p className="mt-0.5 text-sm font-semibold text-claimondo-ondo">{o.subtitle}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-claimondo-shield">{o.text}</p>
                  <a
                    href={o.action.href}
                    {...(o.action.href.startsWith('https') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-claimondo-ondo px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-claimondo-light-blue"
                  >
                    {o.action.label}
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Vertrauen */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-ios-lg p-8">
            <h2
              className="mb-6 text-xl font-bold text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              {t('vertrauen_heading')}
            </h2>
            <ul className="space-y-4">
              {vertrauensPunkte.map((text, idx) => {
                const Icon = VERTRAUENS_ICONS[idx] ?? CheckCircle2
                return (
                  <li key={text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                      <Icon className="h-4 w-4 text-claimondo-ondo" />
                    </div>
                    <span className="text-sm leading-relaxed text-claimondo-shield">{text}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* Alternativ: direkt melden */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-ios-lg border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6 text-center">
            <p className="text-sm text-claimondo-shield">
              {t('alternativ_text')}
            </p>
            <Link
              href="/schaden-melden"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
            >
              {t('alternativ_cta')}
              <ChevronRight className="h-4 w-4" />
            </Link>
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
            {t('cta_heading')}
          </h2>
          <p className="mt-3 text-lg text-white/65">
            {t('cta_sub')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY} {t('cta_anrufen_suffix')}
            </a>
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              {t('cta_online')}
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <TrustBlock
        heading={t('trust_heading')}
        stats={trustStats}
      />

      <LandingFooter />
      <StickyCallBar quelle="Beratung anfragen" />
    </div>
  )
}
