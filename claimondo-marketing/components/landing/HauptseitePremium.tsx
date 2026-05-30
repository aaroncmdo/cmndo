import Link from 'next/link'
import Image from 'next/image'
import { Phone, ChevronRight, MessageCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  serviceSchema, faqPageSchema, jsonLdScript,
  SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import {
  SERVICE_REALITY_BULLETS,
} from '@/lib/brand/service-pitch'
import { CardLink } from '@/components/ui/CardLink'
import { PortalMockupSection } from './sections/PortalMockupSection'
import { WertminderungSandenDannerSection } from './sections/WertminderungSandenDannerSection'
import { TeslaEAutoSection } from './sections/TeslaEAutoSection'
import { TrustStripSection } from './sections/TrustStripSection'
import { BghAuthorityGrid } from './sections/BghAuthorityGrid'
import { BeraterSection } from './sections/BeraterSection'
import { ServiceRealitaetSection } from './sections/ServiceRealitaetSection'
import { PlattformMechanikSection } from './sections/PlattformMechanikSection'
import { HomeLeadFormClient } from './HomeLeadFormClient'

// Hauptseiten-Premium-Layout für claimondo.de — basiert auf dem
// Köln-Handoff-Prototype (IMPLEMENTIERUNGSPLAN.md, KfzGutachterKoelnLanding.tsx),
// generalisiert für nationale Sichtbarkeit. Trust + Conversion + GEO-Authority
// in einem Flow.
//
// Section-Reihenfolge:
//   1. Hero Image Band (Foto-Band mit Quote)
//   2. Hero + Lead-Form (Navy-Glass, 4 Trust-Points, dual-CTA)
//   3. Trust-Strip (4 KPIs)
//   4. Aufklärung — Was Ihnen zusteht (Wissensdatenbank §1, §3, §7)
//   5. BGH-Authority (8 Urteile, simple 4-col Grid)
//   6. Prozess (5 Schritte mit Step-Tag)
//   7. Einsatzgebiet (NRW-Karte + 6 City-Pills)
//   8. Berater (Foto + Quote)
//   9. FAQ (10 Items, Schema-fähig)
//   10. Bottom CTA (Navy mit Glow)
//
// Wissensdatenbank-Quotables sind direkt in den Body integriert, damit AI-
// Crawler (GPTBot, ClaudeBot, PerplexityBot) sie wörtlich übernehmen können
// (Princeton-GEO-Patterns: Cite Sources, Statistics Addition, Quotation
// Addition, Authoritative Tone, Easy-to-Understand).

// AAR-UWG-Fix 14.05.2026: KPI-Block bleibt, erhält aber Methodik-Tooltip
// in TrustStripSection (aggregierte Auswertung Partner-Netzwerk, Methodik
// auf Anfrage). Konkrete Zahlen werden per Aaron-TODO aus Supabase
// nachgeschärft; bis dahin Aggregat-Framing.

// AAR-UWG-Fix 14.05.2026: SV-Zählung pro Stadt entfernt — Zahlen waren nicht
// belegbar (Phantom). Bis echte Counts aus `sachverstaendige` (status='aktiv')
// per Server-Component nachgezogen werden, listen wir die Einsatz-Städte als
// reine Pills. Anker-Stadt Köln bleibt als `primary` markiert.
const CITY_PILLS = [
  { slug: 'koeln',        label: 'Köln',         primary: true as const },
  { slug: 'duesseldorf',  label: 'Düsseldorf' },
  { slug: 'dortmund',     label: 'Dortmund' },
  { slug: 'essen',        label: 'Essen' },
  { slug: 'bonn',         label: 'Bonn' },
  { slug: 'aachen',       label: 'Aachen' },
  { slug: 'hannover',     label: 'Hannover' },
  { slug: 'berlin',       label: 'Berlin' },
  { slug: 'hamburg',      label: 'Hamburg' },
  { slug: 'leipzig',      label: 'Leipzig' },
] as const

// Doc 45 Task 2: Hero-Bullets kommen aus service-pitch.ts (Icons) +
// de.json (Texte). Icons in lokaler Parallelliste — Reihenfolge identisch.
// Doc 45 Task 3: ANSPRUECHE kommt aus de.json (Texte) + hrefs aus de.json.
// service-pitch.ts bleibt unverändert (LP + llms.txt konsumieren es).

export async function HauptseitePremium() {
  const t = await getTranslations('home')

  // Hero-Bullets: Icons aus service-pitch.ts (unveraendert), Labels aus de.json.
  const heroBulletIcons = SERVICE_REALITY_BULLETS.map(({ Icon }) => Icon)
  const heroBulletLabels = t.raw('hero_bullets') as string[]

  // KPIs aus de.json
  const kpis = t.raw('kpis') as { wert: string; label: string }[]
  const kpiMethodik = t('kpi_methodik')

  // Ansprüche-Cards aus de.json
  const ansprucheCards = t.raw('ansprueche.cards') as {
    titel: string
    text: string
    href: string
  }[]

  // Misstrauen-Cards aus de.json
  const misstrauenCards = t.raw('misstrauen.cards') as {
    href: string
    titel: string
    text: string
    cta: string
  }[]

  // Prozess-Steps aus de.json
  const prozessSteps = t.raw('prozess.steps') as {
    nr: number
    titel: string
    text: string
    href: string
  }[]

  // FAQ-Items aus de.json
  const faqItems = t.raw('faq.items') as { frage: string; antwort: string }[]

  const SCHEMA_BLOCK = jsonLdScript([
    serviceSchema({
      name: 'Kfz-Schadensregulierung mit unabhängigem Sachverständigen',
      description:
        'Vermittlung an zertifizierte Kfz-Sachverständige, Anwaltliche Durchsetzung der Ansprüche, vollständige digitale Fallakte. Bundesweit verfügbar. 0 € für unverschuldet Geschädigte nach §249 BGB.',
      url: SITE_URL,
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Kfz-Schaden vollständig regulieren — vom Unfall bis zur Auszahlung',
      description:
        'In fünf Schritten vom unverschuldeten Unfall zur vollständigen Auszahlung — durchschnittlich 32 Tage, ohne Eigenanteil bei unverschuldetem Unfall.',
      totalTime: 'P32D',
      step: prozessSteps.map((s) => ({
        '@type': 'HowToStep',
        position: s.nr,
        name: s.titel,
        text: s.text,
      })),
    },
    faqPageSchema(faqItems),
  ])

  return (
    <div className="bg-claimondo-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={SCHEMA_BLOCK} />

      {/* 1 — Hero Image Band */}
      <section className="relative h-[280px] overflow-hidden sm:h-[360px]" aria-labelledby="hero-band-quote">
        <Image
          src="/marketing-landing-koeln/hero-woman.png"
          alt="Geschädigte ruft Claimondo direkt nach unverschuldetem Verkehrsunfall an"
          fill priority sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/55 to-transparent" aria-hidden />
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-5">
          <div className="max-w-xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              {t('hero_band.eyebrow')}
            </p>
            <p id="hero-band-quote" className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
              {t('hero_band.quote_plain')}{' '}
              <span className="text-claimondo-light-blue">{t('hero_band.quote_accent')}</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Hero + Lead-Form */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="hero-heading">
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
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('hero.trust_badge')}
            </div>
            <h1 id="hero-heading" className="mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
              {t('hero.h1_plain')}<br />
              <span className="text-claimondo-light-blue">{t('hero.h1_accent')}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              {t('hero.sub_headline')}
            </p>
            <ul className="mt-7 grid grid-cols-1 gap-x-4 gap-y-3 text-sm text-white/80 sm:grid-cols-2">
              {heroBulletLabels.map((label, i) => {
                const Icon = heroBulletIcons[i]
                return (
                  <li key={label} className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-light-blue" aria-hidden />
                    {label}
                  </li>
                )
              })}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/gutachter-finden"
                data-tracking="hero-wizard-cta"
                className="inline-flex items-center gap-2 rounded-full bg-claimondo-light-blue px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-white"
              >
                {t('hero.cta_primary')}
              </Link>
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
                data-tracking="call-hero"
              >
                <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                {t('hero.cta_call')}
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
                data-tracking="whatsapp-hero"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t('hero.cta_whatsapp')}
              </a>
            </div>
            <p className="mt-5 text-xs text-white/55">
              {t('hero.trust_footer')}
            </p>
          </div>
          <HomeLeadFormClient />
        </div>
      </section>

      {/* 3 — Trust-Strip */}
      <TrustStripSection kpis={[...kpis]} methodikNote={kpiMethodik} />

      {/* 4 — Aufklärung: Was Ihnen zusteht */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="ansprueche-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('ansprueche.eyebrow')}
            </p>
            <h2 id="ansprueche-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('ansprueche.heading')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
              {t('ansprueche.sub')}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {ansprucheCards.map((a) => (
              <CardLink
                key={a.titel}
                href={a.href}
                title={a.titel}
                body={a.text}
                ctaLabel={t('ansprueche.card_cta')}
                trackingId={`card-anspruch-${a.titel.split(' ')[0].toLowerCase()}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 5 — Service-Realität (NEU, Doc 45 Task 4) */}
      <ServiceRealitaetSection />

      {/* 6 — Berater (hochgezogen von Position 8, Doc 45 Task 6) */}
      <BeraterSection />

      {/* 7 — Plattform-Mechanik (NEU, Doc 45 Task 5) */}
      <PlattformMechanikSection />

      {/* 8 — Misstrauens-Trio (verschoben, Doc 35 Fix 4b/c) */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="sorgen-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('misstrauen.eyebrow')}
            </p>
            <h2 id="sorgen-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('misstrauen.heading')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
              {t('misstrauen.sub')}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {misstrauenCards.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group flex flex-col rounded-ios-md border border-claimondo-border bg-claimondo-bg p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-md"
              >
                <h3 className="text-lg font-bold text-claimondo-navy">{m.titel}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-claimondo-shield">{m.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-claimondo-ondo">
                  {m.cta}
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/unfall-was-tun-als-geschaedigter"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-sm font-semibold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
            >
              {t('misstrauen.leitfaden_cta')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* 9 — BGH-Authority (verschoben) */}
      <BghAuthorityGrid headingId="bgh-heading-premium" />

      {/* 10 — Portal-Mockup (Wie Uber) */}
      <PortalMockupSection />

      {/* 11 — Prozess */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="prozess-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('prozess.eyebrow')}
            </p>
            <h2 id="prozess-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('prozess.heading')}
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5" role="list">
            {prozessSteps.map((s) => (
              <li
                key={s.nr}
                className="group relative rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-md focus-within:ring-2 focus-within:ring-claimondo-ondo"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t('prozess.schritt_label', { nr: s.nr })}
                </span>
                <h3 className="mt-2 text-lg font-bold text-claimondo-navy">{s.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
                {/* Doc 41 §6.2: Pattern B — Pseudo-Link ueber die ganze Card; Schritt-Badge bleibt visueller Anker. */}
                <Link
                  href={s.href}
                  className="absolute inset-0 z-10 rounded-ios-md focus:outline-none"
                  aria-label={t('prozess.card_aria', { nr: s.nr, titel: s.titel })}
                  data-tracking={`card-prozess-${s.nr}`}
                >
                  <span className="sr-only">{t('prozess.details_sr')}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 12 — Wertminderung Sanden/Danner-Tabelle */}
      <WertminderungSandenDannerSection />

      {/* Doc 45 Dedup: inline „report-heading"-Schadensreport-Block entfernt —
          die SchadensreportTeaserSection (schadensreport-teaser, via LandingPage)
          ist der einzige Schadensreport-Teaser auf /. */}

      {/* 13 — Einsatzgebiet */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="einsatzgebiet-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('einsatzgebiet.eyebrow')}
            </p>
            <h2 id="einsatzgebiet-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('einsatzgebiet.heading')}
            </h2>
          </div>
          <div className="mt-12 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg shadow-claimondo-sm">
              <Image
                src="/marketing-landing-koeln/nrw-karte.png"
                alt={t('einsatzgebiet.map_alt')}
                width={900} height={650}
                className="h-auto w-full"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-claimondo-shield">
                {t('einsatzgebiet.city_intro')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {CITY_PILLS.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/kfz-gutachter/${c.slug}`}
                    className={
                      'primary' in c && c.primary
                        ? 'rounded-full bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield'
                        : 'rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy'
                    }
                  >
                    {c.label}
                  </Link>
                ))}
                <Link
                  href="/kfz-gutachter"
                  className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield"
                >
                  {t('einsatzgebiet.alle_staedte_cta')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 14 — Tesla / E-Auto */}
      <TeslaEAutoSection />

      {/* 15 — FAQ */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('faq.eyebrow')}
            </p>
            <h2 id="faq-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('faq.heading')}
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqItems.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5"
              >
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

      {/* 16 — Bottom CTA */}
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
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="call-bottom"
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
            >
              {t('bottom_cta.cta_online')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
