import { localeAlternates } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import Image from 'next/image'
import {
  Phone, ChevronRight, MessageCircle, MapPin,
} from 'lucide-react'
import { SERVICE_REALITY_BULLETS } from '@/lib/brand/service-pitch'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { FounderSection } from '@/components/landing/FounderSection'
import { VersichererTaktikenSection } from '@/components/landing/VersichererTaktikenSection'
import { SiebenFehlerSection } from '@/components/landing/SiebenFehlerSection'
import { PortalMockupSection } from '@/components/landing/sections/PortalMockupSection'
import { WertminderungSandenDannerSection } from '@/components/landing/sections/WertminderungSandenDannerSection'
import { TeslaEAutoSection } from '@/components/landing/sections/TeslaEAutoSection'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { BghAuthorityGrid } from '@/components/landing/sections/BghAuthorityGrid'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema, stadtLegalServiceSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { STAEDTE, getStadtBySlug, type Stadt } from '@/lib/kfz-gutachter/staedte'
import { StadtLeadFormClient } from './StadtLeadFormClient'

// /kfz-gutachter/[stadt] — Premium-Layout für alle SEO-Stadt-Routes.
// Eine Section-Komposition, viele Consumer (AGENTS.md §3 Redundanz-Check).
// Stadt-spezifisch: H1, Hero-Pill, JSON-LD LocalBusiness (geo, areaServed),
// Lokal-Block (Landgericht, Kammer, PLZ, BVSK), FAQ-Mix, Cross-City-Pills.
// Global: KPIs, BGH-Authority, Prozess, Einsatzgebiet, Bottom-CTA.
//
// i18n (Cookie-Switcher, Doc 48 Phase 1): sichtbare rahmende Sätze laufen über
// den Namespace `kfz_gutachter_stadt`. Eigennamen + Stadt-Daten (s.*), §/BGH/€/
// BVSK bleiben Code/ICU-Vars (Doc 48 §5.3). generateMetadata + alle JSON-LD-
// Argumente bleiben deutsch (SEO-kanonisch). Dual-Use-Konstanten (PROZESS_STEPS
// → HowTo-Schema, buildStadtFaq → FAQPage-Schema) behalten ihre deutsche Quelle;
// nur das sichtbare Rendering wird übersetzt (AGENTS.md §5).

export async function generateStaticParams() {
  return STAEDTE.map((s) => ({ stadt: s.slug }))
}

// ISR (geo-freshness Phase 1, L1): Stadt-Pages stuendlich revalidieren, statt nur
// beim Build. dynamicParams=false → harter 404 fuer unbekannte Slugs (kein On-Demand-Render).
export const revalidate = 3600
export const dynamicParams = false

// AAR-UWG-Fix 14.05.2026: KPI-Werte + Aggregator-Methodik-Hinweis (UWG-konform)
// liegen seit der i18n-Migration im Namespace `kfz_gutachter_stadt.trust_kpis` /
// `.trust_methodik`. Konkrete Zahlen werden per Aaron-TODO aus Supabase nachgeschärft.

// Service-Pitch (Doc 44 §11): HERO_BULLETS = SERVICE_REALITY_BULLETS aus
// @/lib/brand/service-pitch — die Icons bleiben Code, die Labels werden i18n
// (hero_bullets, per Index parallel, AGENTS.md §5 / i18n-Lesson 3).
// Die SEO-H1 "Kfz-Gutachter {Stadt}" + Hyperlocal-Sections bleiben unveraendert.

// Dual-Use (AGENTS.md §5): deutsche Quelle speist das HowTo-Schema, das
// sichtbare Rendering läuft über `kfz_gutachter_stadt.prozess_steps`.
const PROZESS_STEPS = [
  { nr: 1, titel: 'Schaden melden',         text: '3 Felder, ohne Anmeldung. Online oder telefonisch.' },
  { nr: 2, titel: 'Berater meldet sich',    text: 'Persönlicher Rückruf in unter 15 Minuten.' },
  { nr: 3, titel: 'DAT-Gutachter vor Ort',  text: 'In unter 48 Stunden besichtigt — meist am Folgetag.' },
  { nr: 4, titel: 'Anwalt aktiv',           text: 'Partnerkanzlei für Verkehrsrecht setzt Ansprüche durch — auch gegen Kürzungen.' },
  { nr: 5, titel: 'Geld auf dem Konto',     text: 'Ø 32 Tage. Live im Portal verfolgbar.' },
] as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stadt: string }>
}): Promise<Metadata> {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) return { title: 'Stadt nicht gefunden' }

  const title = `Kfz-Gutachter ${s.name} — Unabhängig & kostenfrei nach Unfall · Claimondo`
  const description = `Unabhängiger Kfz-Sachverständiger ${s.h1Anker} nach Unfall. Zertifizierte Partner, Termin unter 48 h, 0 € bei unverschuldetem Unfall (§249 BGB).`

  return {
    title,
    description,
    keywords: [
      `Kfz-Gutachter ${s.name}`,
      `Kfz-Sachverständiger ${s.name}`,
      `Unfallgutachter ${s.name}`,
      `Schadensgutachten ${s.name}`,
      `unabhängiger Gutachter ${s.name}`,
      'DAT-Experte', 'Wertminderung berechnen',
      '§249 BGB', 'BVSK-Honorartabelle',
    ],
    alternates: await localeAlternates(`/kfz-gutachter/${s.slug}`),
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
      title,
      description,
      images: [{ url: '/marketing-landing-koeln/hero-woman.png', width: 1200, height: 630, alt: `Kfz-Gutachter ${s.name}` }],
    },
  }
}

function buildStadtFaq(s: Stadt) {
  const base = [
    {
      frage: `Was kostet ein Kfz-Gutachter ${s.h1Anker}?`,
      antwort: `Bei einem unverschuldeten Unfall ${s.h1Anker} mit Schaden über 750 € zahlen Sie 0 €. Die gegnerische Haftpflichtversicherung trägt nach §249 BGB alle Kosten. Honorare nach BVSK-Honorartabelle liegen in ${s.name} zwischen ${s.bvskHonorarSpanne}.`,
    },
    {
      frage: `Wo finde ich einen unabhängigen Kfz-Sachverständigen ${s.h1Anker}?`,
      antwort: `Claimondo vermittelt ${s.h1Anker} an zertifizierte Partner-Gutachter mit lokaler Expertise. Sie melden den Schaden online (5 Min, ohne Anmeldung) — wir matchen Sie mit dem nächstgelegenen freien Sachverständigen aus dem DAT-Partner-Netzwerk. Termin vor Ort in unter 48 Stunden. Verfügbar in ${s.name} (PLZ ${s.plzPrefix}) und im umliegenden ${s.bundesland}.`,
    },
    {
      frage: `Welches Gericht ist bei Streitigkeiten zuständig ${s.h1Anker}?`,
      antwort: `Für Schadensregulierungs-Streitigkeiten ${s.h1Anker} ist erstinstanzlich das ${s.lokal.landgericht} zuständig. Geht eine Versicherung gerichtlich gegen ein Gutachten vor oder kürzt unrechtmäßig, klagt unsere Partnerkanzlei für Verkehrsrecht in der Regel vor diesem Gericht. Bei Erfolg trägt die Gegenseite Anwalts- und Prozesskosten. Sie zahlen 0 € (nach §249 BGB, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).`,
    },
    {
      frage: 'Was passiert, wenn die Versicherung das Gutachten kürzt?',
      antwort: 'Versicherer wie HUK, LVM und AXA kürzen über Prüfdienstleister (ControlExpert, K-Expert, DEKRA) typischerweise UPE-Aufschläge, Verbringung und Wertminderung. Der BGH stützt jedoch in den Leitentscheidungen VI ZR 65/18, VI ZR 174/24 und VI ZR 38/22 ff. die Geschädigten. Unsere Partnerkanzlei holt die Kürzungen vollständig zurück.',
    },
    {
      frage: 'Was ist eine Sicherungsabtretung — und ist sie sicher?',
      antwort: 'Bei der Sicherungsabtretung gemäß §398 BGB überträgt der Geschädigte den Anspruch gegen die gegnerische Versicherung in Höhe des Gutachterhonorars an den Sachverständigen. Sie unterzeichnen einmal — der Gutachter rechnet anschließend direkt mit der Versicherung ab. Sie zahlen keinen Cent vor. Branchen-Standard.',
    },
    {
      frage: 'Wie viel Wertminderung bekomme ich nach einem Unfall?',
      antwort: 'Die merkantile Wertminderung liegt nach Sanden/Danner-Formel zwischen 500 € und 2.500 €. Faustregel: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % der Reparaturkosten. Keine starre Altersgrenze laut BGH VI ZR 357/03.',
    },
    {
      frage: 'Was bedeutet die 130%-Regel beim Totalschaden?',
      antwort: 'Die 130%-Regel (BGH VI ZR 67/91) erlaubt Reparaturkosten bis 130 % des Wiederbeschaffungswertes — sofern fachgerecht repariert nach Gutachten und das Fahrzeug 6 Monate weitergenutzt wird.',
    },
  ]
  // Hub-Cities (Doc 38): lokale FAQ anhängen — fließen in Akkordeon + FAQPage-Schema.
  return s.hyperlocal?.lokaleFaqs ? [...base, ...s.hyperlocal.lokaleFaqs] : base
}

export default async function KfzGutachterStadtPage({
  params,
}: {
  params: Promise<{ stadt: string }>
}) {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) notFound()

  // Deutsche Quelle fürs FAQPage-Schema (Dual-Use, AGENTS.md §5).
  const faqs = buildStadtFaq(s)

  // areaServed: bei Hub-Cities die angrenzenden Orte als City-Array + die vollständige,
  // verifizierte PLZ-Liste als Text-Einträge (Doc 38 §9.2 / P6 — stärkt Local-SEO/GEO
  // ohne neue Seiten). Wo keine plzListe recherchiert ist, bleibt es bei der City. Sonst
  // die einzelne Stadt.
  const cityPlace = {
    '@type': 'City',
    name: s.name,
    containedInPlace: { '@type': 'AdministrativeArea', name: s.bundesland },
  }
  const areaServed = s.hyperlocal
    ? [
        cityPlace,
        ...s.hyperlocal.angrenzendeOrte.map((ort) => ({ '@type': 'City', name: ort })),
        ...(s.hyperlocal.plzListe ?? []),
      ]
    : cityPlace

  // Cross-City: bis zu 6 Nachbarn nach Bundesland, sonst Auffüller aus anderen Bundesländern
  const nachbarn = STAEDTE
    .filter((x) => x.slug !== s.slug && x.bundesland === s.bundesland)
    .slice(0, 6)
  const fallback = nachbarn.length < 6
    ? STAEDTE.filter((x) => x.slug !== s.slug && !nachbarn.some((n) => n.slug === x.slug)).slice(0, 6 - nachbarn.length)
    : []
  const crossCity = [...nachbarn, ...fallback]

  // i18n: async Server-Page (await params) → getTranslations, NICHT useTranslations
  // (i18n-Lesson 7). `ort` = h1Anker ("in Köln") bleibt deutsch (Eigenname, Doc 48 §5.3).
  const t = await getTranslations('kfz_gutachter_stadt')
  const ort = s.h1Anker

  const heroBullets = t.raw('hero_bullets') as string[]
  const trustKpis = t.raw('trust_kpis') as Array<{ wert: string; label: string }>
  const prozessSteps = t.raw('prozess_steps') as Array<{ titel: string; text: string }>

  // Sichtbare FAQ-Liste: 7 Basis-FAQs übersetzt (Stadt-Daten als ICU-Vars, §/BGH/€
  // wörtlich), die hyperlocal.lokaleFaqs (reine Stadt-Daten) bleiben deutsch
  // (Doc 48 §5.3 / §7). Das deutsche buildStadtFaq(s) oben speist das Schema (§5).
  const faqsVisible = [
    { frage: t('faq_kosten_frage', { ort }), antwort: t('faq_kosten_antwort', { ort, stadt: s.name, bvskSpanne: s.bvskHonorarSpanne }) },
    { frage: t('faq_finden_frage', { ort }), antwort: t('faq_finden_antwort', { ort, stadt: s.name, plz: s.plzPrefix, bundesland: s.bundesland }) },
    { frage: t('faq_gericht_frage', { ort }), antwort: t('faq_gericht_antwort', { ort, landgericht: s.lokal.landgericht }) },
    { frage: t('faq_kuerzung_frage'), antwort: t('faq_kuerzung_antwort') },
    { frage: t('faq_sa_frage'), antwort: t('faq_sa_antwort') },
    { frage: t('faq_wertminderung_frage'), antwort: t('faq_wertminderung_antwort') },
    { frage: t('faq_130_frage'), antwort: t('faq_130_antwort') },
    ...(s.hyperlocal?.lokaleFaqs ?? []),
  ]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          stadtLegalServiceSchema(s, areaServed),
          serviceSchema({
            name: `Kfz-Gutachter-Vermittlung ${s.name}`,
            description: `Vermittlung an unabhängige zertifizierte Kfz-Sachverständige ${s.h1Anker}. DAT-Partner-Gutachter aus dem Netzwerk, Termin <48 h, 0 € für unverschuldet Geschädigte nach §249 BGB.`,
            url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: `Schaden ${s.h1Anker} melden und Geld erhalten`,
            description: `In fünf Schritten vom unverschuldeten Unfall ${s.h1Anker} zur Auszahlung — durchschnittlich 32 Tage, ohne Eigenanteil.`,
            totalTime: 'P32D',
            step: PROZESS_STEPS.map((p) => ({ '@type': 'HowToStep', position: p.nr, name: p.titel, text: p.text })),
          },
          faqPageSchema(faqs),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: s.name, url: `/kfz-gutachter/${s.slug}` },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* 1 — Hero Image Band */}
      <section className="relative h-[280px] overflow-hidden sm:h-[360px]">
        <Image
          src="/marketing-landing-koeln/hero-woman.png"
          alt={`Unfallgeschädigte ruft Kfz-Gutachter ${s.h1Anker} nach unverschuldetem Verkehrsunfall an`}
          fill priority sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/55 to-transparent" aria-hidden />
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-5">
          <div className="max-w-xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              {t('hero_band_eyebrow', { ort })}
            </p>
            <p className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
              {t.rich('hero_band_quote', {
                hl: (chunks) => <span className="text-claimondo-light-blue">{chunks}</span>,
              })}
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
            <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
              <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span>{s.name}</span>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('hero_badge', { ort })}
            </div>
            <h1 id="hero-heading" className="mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
              {t('hero_h1_line1')}<br />
              <span className="text-claimondo-light-blue">{t('hero_h1_city', { ort })}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              {t('hero_subheadline')}
            </p>
            {s.hyperlocal?.heroAnker && (
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65">
                {s.hyperlocal.heroAnker}
              </p>
            )}
            <ul className="mt-7 grid grid-cols-1 gap-x-4 gap-y-3 text-sm text-white/80 sm:grid-cols-2">
              {SERVICE_REALITY_BULLETS.map(({ Icon }, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-light-blue" aria-hidden />
                  {heroBullets[i]}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
                data-tracking={`call-${s.slug}-hero`}
              >
                <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                {t('hero_cta_call')}
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
                data-tracking={`whatsapp-${s.slug}-hero`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
            <p className="mt-5 text-xs text-white/55">
              {t('hero_trust_line')}
            </p>
          </div>
          <StadtLeadFormClient stadtName={s.name} stadtSlug={s.slug} />
        </div>
      </section>

      {/* 3 — Trust-Strip */}
      <TrustStripSection kpis={trustKpis} methodikNote={t('trust_methodik')} />

      {/* 4 — Lokal-Block (stadt-spezifische Anker) */}
      <section className="bg-claimondo-bg py-16 sm:py-20" aria-labelledby="lokal-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('lokal_eyebrow')}
            </p>
            <h2 id="lokal-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('lokal_h2', { ort })}
            </h2>
          </div>
          <div className="mt-8">
            <AnswerCapsule quelle="§249 BGB · BVSK">
              {t.rich('lokal_capsule', {
                strong: (chunks) => <strong>{chunks}</strong>,
                landgericht: s.lokal.landgericht,
                kammer: s.lokal.kammer,
                plz: s.plzPrefix,
                bevoelkerung: s.bevoelkerung,
                bundesland: s.bundesland,
                bvskSpanne: s.bvskHonorarSpanne,
              })}
            </AnswerCapsule>
          </div>
        </div>
      </section>

      {/* 4b — Hyperlokal: Stadtbezirke + Einsatzgebiet (nur Hub-Cities, Doc 38 §6.2) */}
      {s.hyperlocal && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="bezirke-stadt-heading">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('bezirke_eyebrow', { stadt: s.name })}
              </p>
              <h2 id="bezirke-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('bezirke_h2', { anzahlBezirke: s.hyperlocal.stadtbezirke.length, ort })}
              </h2>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.hyperlocal.stadtbezirke.map((b) => (
                <div key={b.name} className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4">
                  <p className="text-sm font-bold text-claimondo-navy">{b.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-claimondo-shield">
                    {b.ortsteile.join(' · ')}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
              <p className="text-sm leading-relaxed text-claimondo-shield">
                {t.rich('bezirke_region', {
                  strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                  orte: s.hyperlocal.angrenzendeOrte.join(', '),
                })}
              </p>
            </div>
            {s.hyperlocal.topografieAnker && (
              <p className="mt-6 text-center text-sm italic leading-relaxed text-claimondo-shield">
                {s.hyperlocal.topografieAnker}
              </p>
            )}
          </div>
        </section>
      )}

      {/* 4c — Hyperlokal: Unfallschwerpunkte + Hauptachsen, quellenbelegt (Doc 38 §6.3) */}
      {s.hyperlocal && (
        <section className="bg-claimondo-bg py-16 sm:py-20" aria-labelledby="hotspots-stadt-heading">
          <div className="mx-auto max-w-4xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('hotspots_eyebrow')}
              </p>
              <h2 id="hotspots-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('hotspots_h2', { ort })}
              </h2>
              {s.hyperlocal.unfallzahlStadt && (
                <p className="mt-3 text-sm text-claimondo-shield">
                  {t('hotspots_stadtweit', { jahr: String(s.hyperlocal.unfallzahlStadt.jahr), text: s.hyperlocal.unfallzahlStadt.text })}
                </p>
              )}
            </div>
            <ul className="mt-8 space-y-3">
              {s.hyperlocal.unfallHotspots.map((h) => (
                // Doc 41 §8: Hotspot-Cards verlinken auf die Pillar-B-Cornerstone.
                <li key={h.ort}>
                  <Link
                    href="/unfall-was-tun-als-geschaedigter"
                    className="group block rounded-ios-md border border-claimondo-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo"
                    aria-label={t('hotspots_card_aria', { hotspot: h.ort, ort })}
                    data-tracking={`card-hotspot-${s.slug}-${h.ort.split(' ')[0].toLowerCase()}`}
                  >
                    <p className="text-sm font-bold text-claimondo-navy group-hover:text-claimondo-ondo">
                      {h.ort}
                      {h.bezirk && <span className="font-normal text-claimondo-shield"> · {h.bezirk}</span>}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">{h.beschreibung}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-ios-md border border-claimondo-border bg-white p-5 text-sm leading-relaxed text-claimondo-shield">
              <p>
                {t.rich('hotspots_achsen', {
                  strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                  autobahnen: s.hyperlocal.hauptachsen.autobahnen.join(', '),
                  bundesstrassen: s.hyperlocal.hauptachsen.bundesstrassen.join(', '),
                })}
              </p>
              {s.hyperlocal.hauptachsen.knoten.length > 0 && (
                <p className="mt-1">{t('hotspots_knoten', { knoten: s.hyperlocal.hauptachsen.knoten.join(' · ') })}</p>
              )}
              {s.hyperlocal.hauptachsen.aktuelleBaustelle && (
                <p className="mt-1">
                  {t.rich('hotspots_baustelle', {
                    strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                    baustelle: s.hyperlocal.hauptachsen.aktuelleBaustelle,
                  })}
                </p>
              )}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-claimondo-shield">
              {t('hotspots_outro')}
            </p>
            <p className="mt-3 text-xs text-claimondo-shield/75">{t('hotspots_quelle', { quelle: s.hyperlocal.hotspotQuelle })}</p>
          </div>
        </section>
      )}

      {/* 4d — Hyperlokal: Praktische Hilfe nach dem Unfall (öffentliche Stellen, Doc 38 §6.5) */}
      {s.hyperlocal?.oeffentlicheStellen && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="hilfe-stadt-heading">
          <div className="mx-auto max-w-4xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('hilfe_eyebrow')}
              </p>
              <h2 id="hilfe-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('hilfe_h2', { ort })}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">
                {t.rich('hilfe_intro', {
                  strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                  notruf: s.hyperlocal.oeffentlicheStellen.notruf,
                })}
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
                <p className="text-sm font-bold text-claimondo-navy">
                  {s.hyperlocal.oeffentlicheStellen.polizeipraesidium.name}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {s.hyperlocal.oeffentlicheStellen.polizeipraesidium.adresse}
                </p>
                <p className="mt-1 text-sm text-claimondo-shield">
                  {t('hilfe_vermittlung', {
                    telefon: s.hyperlocal.oeffentlicheStellen.polizeipraesidium.telefon,
                    notruf: s.hyperlocal.oeffentlicheStellen.notruf,
                  })}
                </p>
              </div>
              <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
                <p className="text-sm font-bold text-claimondo-navy">
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.name}{' '}
                  {t('hilfe_kennzeichen', { kennzeichen: s.hyperlocal.oeffentlicheStellen.zulassungsstelle.kennzeichen })}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.adresse}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {t('hilfe_tel', { telefon: s.hyperlocal.oeffentlicheStellen.zulassungsstelle.telefon })}
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.oeffnungszeiten
                    ? ` · ${s.hyperlocal.oeffentlicheStellen.zulassungsstelle.oeffnungszeiten}`
                    : ''}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-claimondo-shield/75">
              {t('hilfe_tipp')}
            </p>
          </div>
        </section>
      )}

      {/* 4e — Spoke-Town: Anbindung an die Hub-City (Doc 38 P5, minimal-unique) */}
      {s.spokeLocal && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="spoke-stadt-heading">
          <div className="mx-auto max-w-3xl px-5">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                {t('spoke_eyebrow', { hubName: s.spokeLocal.hubName })}
              </p>
              <h2 id="spoke-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                {t('spoke_h2', { ort })}
              </h2>
            </div>
            <p className="mt-6 text-center text-base leading-relaxed text-claimondo-shield">
              {s.spokeLocal.anekdote}
            </p>
            <div className="mt-6 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 text-sm leading-relaxed text-claimondo-shield">
              <p>
                {t.rich('spoke_achsen', {
                  strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                  hauptachsen: s.spokeLocal.hauptachsen.join(', '),
                })}
              </p>
              {s.spokeLocal.stadtbezirke && s.spokeLocal.stadtbezirke.length > 0 && (
                <p className="mt-2">
                  {t.rich('spoke_stadtteile', {
                    strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                    stadtteile: s.spokeLocal.stadtbezirke.map((b) => b.name).join(', '),
                  })}
                </p>
              )}
              {s.spokeLocal.vorwahl && (
                <p className="mt-2">
                  {t.rich('spoke_vorwahl', {
                    strong: (chunks) => <strong className="text-claimondo-navy">{chunks}</strong>,
                    vorwahl: s.spokeLocal.vorwahl,
                  })}
                </p>
              )}
              <p className="mt-2">
                {t.rich('spoke_einsatz', {
                  stadt: s.name,
                  hubName: s.spokeLocal.hubName,
                  link: (chunks) => (
                    <Link
                      href={`/kfz-gutachter/${s.spokeLocal!.hubSlug}`}
                      className="font-semibold text-claimondo-ondo underline hover:text-claimondo-navy"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
            {s.spokeLocal.hotspot && (
              <div className="mt-4 rounded-ios-md border border-claimondo-border bg-white p-5 text-sm leading-relaxed text-claimondo-shield">
                <p>
                  <strong className="text-claimondo-navy">
                    {s.spokeLocal.hotspot.einzelfall ? t('spoke_hotspot_einzelfall') : t('spoke_hotspot_schwerpunkt')}:
                  </strong>{' '}
                  {s.spokeLocal.hotspot.ort}
                </p>
                <p className="mt-1">{s.spokeLocal.hotspot.beschreibung}</p>
                <p className="mt-1 text-xs">
                  <a
                    href={s.spokeLocal.hotspot.quelle}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="text-claimondo-ondo underline hover:text-claimondo-navy"
                  >
                    {t('spoke_quelle')}
                  </a>
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5 — BGH-Authority */}
      <BghAuthorityGrid
        headingId="bgh-stadt-heading"
        subline={t('bgh_subline', { ort })}
      />

      {/* 5b — Portal-Mockup (Wie Uber) */}
      <PortalMockupSection />

      {/* 5c — Versicherer-Taktiken (Wissensdatenbank §2, §15) */}
      <VersichererTaktikenSection />

      {/* 6 — Prozess */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="prozess-stadt-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('prozess_eyebrow')}
            </p>
            <h2 id="prozess-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('prozess_h2', { ort })}
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5" role="list">
            {PROZESS_STEPS.map((step, i) => (
              <li
                key={step.nr}
                className="relative rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t('prozess_schritt', { nr: step.nr })}
                </span>
                <h3 className="mt-2 text-lg font-bold text-claimondo-navy">{prozessSteps[i]?.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{prozessSteps[i]?.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6b — Wertminderung Sanden/Danner-Tabelle */}
      <WertminderungSandenDannerSection />

      {/* 6c — 7 Fehler nach Unfall (Wissensdatenbank §12) */}
      <SiebenFehlerSection />

      {/* 7 — Einsatzgebiet / Cross-City */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="einsatzgebiet-stadt-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('einsatz_eyebrow')}
            </p>
            <h2 id="einsatzgebiet-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('einsatz_h2')}
            </h2>
          </div>
          <div className="mt-12 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg shadow-claimondo-sm">
              <Image
                src="/marketing-landing-koeln/nrw-karte.png"
                alt="Claimondo Einsatzgebiet — Schwerpunkt Nordrhein-Westfalen, deutschlandweite Anbindung"
                width={900} height={650}
                className="h-auto w-full"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-claimondo-shield">
                {t('einsatz_verfuegbar')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {crossCity.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/kfz-gutachter/${c.slug}`}
                    className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
                  >
                    {c.name}
                  </Link>
                ))}
                <Link
                  href="/kfz-gutachter"
                  className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield"
                >
                  {t('einsatz_alle')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7b — Tesla / E-Auto Spezial */}
      <TeslaEAutoSection />

      {/* 7c — Gründer Trust-Anker */}
      <FounderSection />

      {/* 8 — FAQ */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="faq-stadt-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('faq_eyebrow', { ort })}
            </p>
            <h2 id="faq-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('faq_h2')}
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqsVisible.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-claimondo-border bg-white p-5"
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
            {t('cta_h2', { ort })}
          </h2>
          <p className="mt-4 text-white/75">
            {t('cta_p', { ort })}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking={`call-${s.slug}-bottom`}
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
            >
              <MapPin className="h-5 w-5" aria-hidden />
              {t('cta_karte')}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle={`Kfz-Gutachter ${s.name}`} />
    </div>
  )
}
