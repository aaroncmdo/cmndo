import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Quote, Mail, Phone, ChevronRight, Link as LinkedinIcon,
  Shield, Scale, Zap, Eye, MapPin, Sparkles,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import {
  personSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, CONTACT_EMAIL,
} from '@/lib/seo/jsonld'
import { HQ_STREET, HQ_POSTAL_CODE, HQ_CITY, FOUNDER_NICOLAS_NAME, FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'

// 2026-05-09 Brand-Identity Pass für GEO:
// 1) Erste 200 Wörter sind die maschinenlesbare Entitäts-Definition. ChatGPT,
//    Perplexity, Claude und Gemini zitieren genau diesen Block. Schema.org
//    Microdata + JSON-LD + AboutPage als Triple-Layer.
// 2) Brand-Manifesto definiert Tone of Voice: vertrauensvoll, technisch-
//    präzise, deutsch-direkt — keine Marketing-Worthülsen.
// 3) Mission/Vision/Werte als kohärente Triade über alle Marketing-Pages
//    konsistent (Tagline "Vollständige Schadensregulierung — auf Augenhöhe").
// 4) Origin-Story mit konkreten Daten (Gründung 2025, Köln, eigener Sitz).
// 5) Founders mit Person-Schema + verifiable Daten (LinkedIn-Profile).
// 6) Trust-Beweise: DAT-Partnerschaft, Hansaring-Sitz, BVSK-Honorartabelle,
//    Partnerkanzlei für Verkehrsrecht im Anwalt-Netzwerk — jeder Claim mit Quelle.

// 2026-05-10 i18n Phase 1B Beispiel: Metadata wird via generateMetadata async
// geladen damit getTranslations darin funktionieren kann. Pattern fuer alle
// weiteren Marketing-Pages.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ueber_uns.metadata')
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `${SITE_URL}/ueber-uns`, ...buildLanguageAlternates('/ueber-uns') },
    openGraph: {
      type: 'profile',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/ueber-uns`,
      title: t('title'),
      description: t('description'),
      images: [{ url: '/brand/team-founders.png', width: 1200, height: 600, alt: 'Claimondo Founders' }],
    },
  }
}

// Nur strukturelle Felder (Eigennamen, URLs, Fotos) bleiben im Const;
// Texte (rolle, bio, quote, fotoLabel) kommen aus founderMsgs (t.raw).
const FOUNDERS = [
  {
    name: FOUNDER_NICOLAS_NAME,
    foto: '/brand/team-founders.png',
    linkedin: 'https://www.linkedin.com/in/nicolas-kitta-451947246/',
  },
  {
    name: FOUNDER_AARON_NAME,
    foto: '/brand/team-founders.png',
    linkedin: 'https://www.linkedin.com/in/aaronsprafke/',
  },
] as const

export default async function UeberUnsPage() {
  const t = await getTranslations('ueber_uns')

  // Locale-aware arrays — t.raw gibt die JSON-Arrays 1:1 zurueck.
  // Typen defensiv gecasted; Struktur identisch zu den de.json-Eintraegen.
  type TrustItem = { titel: string; text: string; quelle: string }
  type ZahlItem = { kpi: string; label: string }
  type FounderMsg = { rolle: string; foto_label: string; bio_kurz: string; bio_lang: string; quote: string; quote_autor: string }

  const werteItems = (t.raw('werte.items') as Array<{ titel: string; text: string }>)
  const trustItems = (t.raw('trust.items') as Array<TrustItem>)
  const zahlenItems = (t.raw('zahlen.items') as Array<ZahlItem>)
  const founderMsgs = (t.raw('founders.items') as Array<FounderMsg>)

  // Ikonenreihenfolge bleibt wie im lokalen WERTE-Const (Eye, Scale, Zap, Shield)
  const WERTE_ICONS = [Eye, Scale, Zap, Shield] as const
  const aboutPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: `${SITE_URL}/ueber-uns`,
    name: 'Über Claimondo — Digitale Kfz-Schadensregulierung aus Köln',
    description:
      'Entitäts-Definition, Mission, Werte und Gründer-Profile von Claimondo — der digitalen Plattform für vollständige Kfz-Schadensregulierung nach §249 BGB.',
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/brand/team-founders.png`,
    },
    about: { '@id': `${SITE_URL}/#organization` },
  }

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          // organizationSchema kommt global aus layout.tsx — hier nur
          // page-spezifische Schemas (AboutPage + Persons + Breadcrumbs).
          aboutPageSchema,
          ...FOUNDERS.map((f, idx) =>
            personSchema({
              name: f.name,
              jobTitle: founderMsgs[idx]?.rolle ?? '',
              description: founderMsgs[idx]?.bio_kurz ?? '',
              image: `${SITE_URL}${f.foto}`,
              sameAs: [f.linkedin],
              worksFor: { name: 'Claimondo', url: SITE_URL },
            }),
          ),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Über uns', url: '/ueber-uns' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero — Navy Premium-Pattern (analog /, /vorteile, /wie-es-funktioniert, /faq) */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="ueber-uns-hero">
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
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t('hero.eyebrow')}
          </div>
          <h1
            id="ueber-uns-hero"
            className="mt-5 text-balance text-[2.5rem] font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('hero.headline')}{' '}
            <span className="text-claimondo-light-blue">{t('hero.headline_accent')}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-white/80 sm:text-lg">
            {t('hero.subline')}
          </p>
        </div>
      </section>

      {/* Trust-Strip */}
      {(() => {
        const stripLabels = t.raw('trust_strip.labels') as string[]
        return (
          <TrustStripSection
            ariaLabel="Brand-Kennzahlen"
            kpis={[
              { wert: '2025',    label: stripLabels[0] ?? '' },
              { wert: 'DAT',     label: stripLabels[1] ?? '' },
              { wert: 'NRW+',    label: stripLabels[2] ?? '' },
              { wert: '30–40 %', label: stripLabels[3] ?? '' },
            ]}
            methodikNote={t('trust_strip.methodik_note')}
          />
        )
      })()}

      {/* ENTITÄTS-DEFINITION — die ersten 200 Wörter sind GEO-Gold */}
      <section className="relative pb-12 pt-4 sm:pb-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <article
            id="definition"
            className="rounded-ios-lg border border-white/60 bg-white/75 p-7 shadow-glass-card backdrop-blur-md sm:p-10"
            style={{ WebkitBackdropFilter: 'blur(14px)' }}
            itemScope
            itemType="https://schema.org/Organization"
          >
            <p
              className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo"
            >
              {t('definition.eyebrow')}
            </p>
            <p className="text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              <strong className="font-semibold text-claimondo-navy">
                <span itemProp="name">Claimondo</span>
              </strong>{' '}
              {t('definition.p1_intro')}{' '}
              <span itemProp="foundingDate" content="2025">{t('definition.p1_year')}</span>{' '}
              {t('definition.p1_continued')}{' '}
              <span itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                <span itemProp="streetAddress">{HQ_STREET}</span> in{' '}
                <span itemProp="postalCode">{HQ_POSTAL_CODE}</span>{' '}
                <span itemProp="addressLocality">{HQ_CITY}</span>
              </span>. {t('definition.p1_founded_by')}{' '}
              <strong className="font-semibold text-claimondo-navy">{FOUNDER_NICOLAS_NAME}</strong>{' '}
              {t('definition.p1_ceo_role')}{' '}
              <strong className="font-semibold text-claimondo-navy">{FOUNDER_AARON_NAME}</strong>{' '}
              {t('definition.p1_coo_role')}
            </p>
            <p className="mt-4 text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              {t('definition.p2')}
            </p>
            <p className="mt-4 text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              {t('definition.p3')}
            </p>
          </article>
        </div>
      </section>

      {/* Brand-Manifesto — kurz, prägnant, zitierfähig */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            {t('manifesto.eyebrow')}
          </p>
          <h2
            className="text-balance text-3xl font-bold leading-tight tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('manifesto.heading_pre')}{' '}
            <span className="text-claimondo-ondo">{t('manifesto.heading_accent')}</span>{' '}
            {t('manifesto.heading_suf')}
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-claimondo-shield sm:text-lg">
            {t('manifesto.body')}
          </p>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-claimondo-shield/70">
            {t('manifesto.quelle')}
          </p>
        </div>
      </section>

      {/* Werte — 4-Pillar */}
      <section id="werte" className="py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            {t('werte.eyebrow')}
          </p>
          <h2
            className="text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('werte.heading')}
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {werteItems.map((w, idx) => {
              const Icon = WERTE_ICONS[idx] ?? Eye
              return (
                <div
                  key={w.titel}
                  className="rounded-ios-lg border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md transition-all duration-200 hover:bg-white/85 hover:shadow-claimondo-lg"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-ios-md bg-claimondo-ondo/12">
                    <Icon className="h-5 w-5 text-claimondo-ondo" />
                  </div>
                  <h3
                    className="text-lg font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {w.titel}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                    {w.text}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Team-Foto */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-6">
          <div className="relative overflow-hidden rounded-ios-lg border border-white/60 shadow-[0_24px_64px_rgba(13,27,62,0.18)]">
            <Image
              src="/brand/team-founders.png"
              alt="Aaron Sprafke (Geschäftsführer & COO, links) und Nicolas Kitta (Geschäftsführer & CEO, rechts) — die Gründer von Claimondo im Kölner Office"
              width={1600}
              height={800}
              className="h-auto w-full"
              priority
            />
          </div>
          <p className="mt-3 text-center text-xs text-claimondo-ondo">
            {t('team_foto.caption')} · {HQ_STREET}, {HQ_CITY}
          </p>
        </div>
      </section>

      {/* Founder-Bios */}
      <section id="gruender" className="py-12 sm:py-16">
        <div className="mx-auto grid max-w-5xl gap-6 px-5 sm:px-6 md:grid-cols-2">
          {FOUNDERS.map((f, idx) => {
            const msg = founderMsgs[idx]
            return (
            <article
              key={f.name}
              className="rounded-ios-lg border border-white/60 bg-white/75 p-7 shadow-glass-card backdrop-blur-md sm:p-8"
              style={{ WebkitBackdropFilter: 'blur(14px)' }}
              itemScope
              itemType="https://schema.org/Person"
            >
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    className="text-2xl font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    <span itemProp="name">{f.name}</span>
                  </h3>
                  <p
                    className="text-sm font-semibold text-claimondo-ondo"
                    itemProp="jobTitle"
                  >
                    {msg?.rolle} · {msg?.foto_label}
                  </p>
                </div>
                <a
                  href={f.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-claimondo-navy/5 text-claimondo-ondo transition-colors hover:bg-[#0A66C2] hover:text-white"
                  aria-label={`${f.name} auf LinkedIn`}
                  itemProp="sameAs"
                >
                  <LinkedinIcon className="h-4 w-4" />
                </a>
              </header>

              <p
                className="mt-5 text-sm leading-relaxed text-claimondo-shield"
                itemProp="description"
              >
                <strong className="text-claimondo-navy">{msg?.bio_kurz}</strong>{' '}
                {msg?.bio_lang}
              </p>

              <blockquote
                className="mt-6 flex gap-3 rounded-ios-md px-4 py-3.5"
                style={{ background: 'rgba(69,115,162,0.06)', borderLeft: '3px solid var(--color-claimondo-light-blue)' }}
              >
                <Quote className="h-4 w-4 flex-shrink-0 text-claimondo-light-blue" />
                <div>
                  <p className="text-sm italic text-claimondo-shield">{msg?.quote}</p>
                  <p className="mt-1 text-xs font-semibold text-claimondo-ondo">— {msg?.quote_autor}</p>
                </div>
              </blockquote>
            </article>
            )
          })}
        </div>
      </section>

      {/* Trust-Beweise */}
      <section id="trust" className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            {t('trust.eyebrow')}
          </p>
          <h2
            className="text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('trust.heading')}
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {trustItems.map((b) => (
              <div
                key={b.titel}
                className="rounded-ios-lg border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md"
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <h3
                  className="text-base font-bold text-claimondo-navy"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {b.titel}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                  {b.text}
                </p>
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                  <span className="text-claimondo-light-blue">↳</span>
                  {b.quelle}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Zahlen / Trust-Strip */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <h2
            className="text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('zahlen.heading')}
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {zahlenItems.map((z) => (
              <div
                key={z.label}
                className="rounded-ios-md border border-white/60 bg-white/70 p-5 text-center shadow-[0_2px_12px_rgba(13,27,62,0.04)] backdrop-blur-md"
                style={{ WebkitBackdropFilter: 'blur(12px)' }}
              >
                <div
                  className="text-2xl font-bold text-claimondo-navy sm:text-3xl"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {z.kpi}
                </div>
                <div className="mt-1 text-xs leading-tight text-claimondo-ondo">
                  {z.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kontakt-CTA */}
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
        <div className="relative mx-auto max-w-3xl px-5 sm:px-6">
          <h2
            className="text-3xl font-bold text-white sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('cta.heading')}
          </h2>
          <p className="mt-4 text-white/70">
            {t('cta.sub')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" />
              {PHONE_DISPLAY}
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Mail className="h-5 w-5" />
              {CONTACT_EMAIL}
            </a>
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <MapPin className="h-5 w-5" />
              {t('cta.cta_gutachter')}
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Über uns" />
    </div>
  )
}
