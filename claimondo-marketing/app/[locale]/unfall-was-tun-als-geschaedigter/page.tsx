import type { Metadata } from 'next'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Phone, ChevronRight, Check } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import {
  articleSchema, howToSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { localeAlternates } from '@/lib/seo/alternates'

// Stream B.5 (Doc 26) — Cornerstone-Pillar „Unfall — was tun als Geschädigter".
// Primärer „was tun nach unfall"-Pillar (Vol 500, gegen HUK-Position #7). Hub:
// verlinkt nach unten auf Szenario-Spokes + die Rechte-/Misstrauens-Pages (B.2).
// /ratgeber wird per rel=canonical hierauf konsolidiert (bleibt emotionaler
// Begleiter) — siehe app/ratgeber/page.tsx. Bespoke page.tsx (Stream-B-Muster).
// JSON-LD: Article + HowTo (Sofortmaßnahmen) + FAQPage + breadcrumb.
//
// i18n: sichtbarer Text via useTranslations('unfall_was_tun'). Die Konstanten
// SOFORT + FAQS bleiben DEUTSCH — sie speisen das JSON-LD (howTo-/faqPage-Schema,
// SEO-kanonisch). Die sichtbaren Renderings der beiden lesen aus t.raw('sofort'/'faqs').

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF
const URL_SELF = `${SITE_URL}/unfall-was-tun-als-geschaedigter`

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('unfall_was_tun.title'),
    description: t('unfall_was_tun.description'),
    keywords: [
      'unfall was tun', 'was tun nach unfall', 'unfall was tun als geschädigter',
      'verhalten nach unfall', 'unfall checkliste', 'was tun nach autounfall unverschuldet',
      'unfall sofortmaßnahmen', 'unverschuldeter unfall ablauf',
    ],
    alternates: await localeAlternates('/unfall-was-tun-als-geschaedigter'),
    openGraph: {
      type: 'article',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: URL_SELF,
      title: t('unfall_was_tun.og_title'),
      description: t('unfall_was_tun.og_description'),
    },
  }
}

// Sofortmaßnahmen am Unfallort → HowTo-Schema (GEO: hohe Citation-Wahrscheinlichkeit).
// DEUTSCH (JSON-LD-Quelle). Sichtbares Rendering liest aus t.raw('sofort').
const SOFORT: Array<{ name: string; text: string }> = [
  { name: 'Unfallstelle absichern', text: 'Warnblinker an, Warnweste anlegen, Warndreieck in ausreichendem Abstand aufstellen (innerorts ~50 m, Landstraße ~100 m, Autobahn ~150–200 m).' },
  { name: 'Verletzte versorgen, Notruf 112', text: 'Bei Verletzten zuerst Erste Hilfe und Rettungsdienst (112). Unterlassene Hilfeleistung ist strafbar — Eigenschutz beachten.' },
  { name: 'Polizei rufen (110)', text: 'Bei Personenschaden, höherem Sachschaden, Streit über den Hergang, Fahrerflucht, Alkohol-/Drogenverdacht oder Beteiligung von Mietwagen/Ausland. Im Zweifel rufen.' },
  { name: 'Beweise sichern', text: 'Fotos aus mehreren Perspektiven (Übersicht, Endpositionen, Schäden, Kennzeichen, Bremsspuren) und eine Unfallskizze anfertigen.' },
  { name: 'Daten austauschen', text: 'Name, Anschrift, Kennzeichen, Haftpflichtversicherung und Versicherungsnummer der Gegenseite notieren — aber kein Schuldeingeständnis abgeben.' },
  { name: 'Zeugen sichern', text: 'Namen und Telefonnummern unbeteiligter Zeugen notieren — sie sind bei strittiger Haftung oft entscheidend.' },
  { name: 'Eigenen Gutachter & Anwalt einschalten', text: 'Vor Reparaturbeginn einen eigenen, unabhängigen Sachverständigen beauftragen (Beweissicherung) und die Ansprüche über eine Verkehrsrechts-Kanzlei durchsetzen lassen.' },
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was muss ich nach einem Unfall sofort tun?',
    antwort:
      'Unfallstelle absichern (Warnblinker, Warnweste, Warndreieck), Verletzte versorgen und ggf. 112 rufen, bei Bedarf die Polizei (110), Beweise sichern (Fotos + Unfallskizze), Daten der Gegenseite notieren — ohne Schuldeingeständnis — und vor der Reparatur einen eigenen Sachverständigen beauftragen.',
  },
  {
    frage: 'Wann muss die Polizei zum Unfall kommen?',
    antwort:
      'Spätestens bei Personenschaden, höherem Sachschaden, Streit über den Hergang, Fahrerflucht, Alkohol-/Drogenverdacht oder Auslands-/Mietwagenbeteiligung. Im Zweifel immer rufen — die polizeiliche Aufnahme sichert Beweise.',
  },
  {
    frage: 'Darf ich am Unfallort die Schuld eingestehen?',
    antwort:
      'Nein. Geben Sie kein Schuldeingeständnis ab und unterschreiben Sie keine vorformulierten Erklärungen. Halten Sie nur Beobachtetes fest — die Haftung klärt sich später anhand der Beweislage.',
  },
  {
    frage: 'Brauche ich einen Anwalt — und was kostet er mich?',
    antwort:
      'Bei unverschuldetem Unfall sind die Kosten der anwaltlichen Vertretung erforderlicher Herstellungsaufwand und werden vom gegnerischen Haftpflichtversicherer getragen (BGH VI ZR 235/13). Für Sie entstehen keine Eigenkosten — wer ohne Anwalt verhandelt, akzeptiert dagegen häufig zu niedrige Angebote.',
  },
  {
    frage: 'Was zahlt die gegnerische Versicherung?',
    antwort:
      'Bei unverschuldetem Unfall den vollständigen Schaden nach § 249 BGB: Reparatur oder Wiederbeschaffung, Wertminderung, Nutzungsausfall oder Mietwagen, Sachverständigen- und Anwaltskosten sowie — bei Personenschaden — Schmerzensgeld. Durchgesetzt über den Direktanspruch (§ 115 VVG).',
  },
  {
    frage: 'Wie lange habe ich Zeit, meine Ansprüche durchzusetzen?',
    antwort:
      'Die regelmäßige Verjährung beträgt 3 Jahre (§ 195 BGB) ab Schluss des Jahres der Kenntnis; bei Personenschäden bis zu 30 Jahre (§ 199 Abs. 2 BGB). Beweise sichern Sie aber am besten sofort.',
  },
]

export default function Page() {
  const t = useTranslations('unfall_was_tun')

  // hrefs bleiben im Code (Routen, nicht übersetzbar). Labels/Texte kommen aus
  // t.raw(...) in identischer Reihenfolge — Index-Mapping.
  const TYPEN_HREFS = [
    '/haftpflicht/auffahrunfall',
    '/haftpflicht/vorfahrt-rechts-vor-links',
    '/haftpflicht/linksabbieger',
    '/haftpflicht/spurwechsel',
    '/haftpflicht/parkplatz',
    '/haftpflicht/rotlicht',
  ]
  const RECHTE_HREFS = ['/unverschuldeter-unfall-rechte', '/kfz-haftpflicht-schaden', '/kosten-kfz-gutachten']
  const VERSICHERUNG_HREFS = ['/versicherung-schickt-gutachter', '/gegnerische-versicherung-zahlt-nicht', '/decoder']

  const sofort = t.raw('sofort') as Array<{ name: string; text: string }>
  const typen = t.raw('typen') as Array<{ titel: string; haftung: string }>
  const antwortBullets = t.raw('antwort_bullets') as string[]
  const rechteLinks = t.raw('rechte_links') as string[]
  const versicherungLinks = t.raw('versicherung_links') as string[]
  const faqs = t.raw('faqs') as Array<{ frage: string; antwort: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          articleSchema({
            headline: 'Unfall — was tun als Geschädigter? Sofortmaßnahmen, Haftung & Rechte',
            description:
              'Umfassender Leitfaden für unverschuldet Unfallgeschädigte: Sofortmaßnahmen am Unfallort, Haftung nach Unfalltyp, Ansprüche nach § 249 BGB und die typischen Versicherer-Taktiken.',
            datePublished: '2026-05-24',
            url: URL_SELF,
            citation: ['§ 249 BGB', '§ 115 VVG', '§ 7 StVG', '§ 9 StVO', 'BGH VI ZR 235/13'],
          }),
          howToSchema({
            name: 'Was tun nach einem unverschuldeten Unfall — Sofortmaßnahmen',
            description: 'Die richtigen Schritte direkt nach einem Verkehrsunfall, um sich und Ihre Ansprüche zu sichern.',
            totalTime: 'PT30M',
            schritte: SOFORT,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Unfall — was tun als Geschädigter', url: '/unfall-was-tun-als-geschaedigter' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">{t('breadcrumb_start')}</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">{t('breadcrumb_current')}</span>
        </nav>

        {/* Hero */}
        <header className="relative overflow-hidden rounded-ios-lg bg-claimondo-navy p-8 text-white sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(circle at 18% 20%, rgba(69,115,162,0.40), transparent 55%)' }}
          />
          <div className="relative">
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              {t('hero_badge')}
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              {t('hero_h1')}
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              {t.rich('hero_intro', { strong: (chunks) => <strong className="text-white">{chunks}</strong> })}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/schaden-melden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                {t('hero_cta_primary')}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-3.5 font-bold text-white transition hover:bg-white/10">
                <Phone className="h-4 w-4" aria-hidden />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </header>

        {/* Antwort-zuerst */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('antwort_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('antwort_p')}
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {antwortBullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        </section>

        {/* Sofortmaßnahmen (HowTo) */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('sofort_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('sofort_p')}
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            {sofort.map((s, i) => (
              <li key={s.name} className="flex items-start gap-3 rounded-ios-md border border-claimondo-border bg-white p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-[0.85rem] font-bold text-white">{i + 1}</span>
                <div>
                  <p className="font-bold text-claimondo-navy">{s.name}</p>
                  <p className="mt-1 text-[0.92rem] leading-relaxed text-claimondo-shield">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[0.95rem]">
            → <Link href="/unfallskizze" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{t('unfallskizze_link')}</Link>
          </p>
        </section>

        {/* 6 Unfalltypen (Hub → Spokes) */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('typen_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('typen_p')}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {typen.map((item, i) => (
              <Link
                key={TYPEN_HREFS[i]}
                href={TYPEN_HREFS[i]}
                className="group flex items-start justify-between gap-4 rounded-ios-md border border-claimondo-border bg-white p-4 transition hover:border-claimondo-ondo/40 hover:bg-claimondo-bg"
              >
                <div>
                  <p className="font-bold text-claimondo-navy">{item.titel}</p>
                  <p className="mt-1 text-[0.9rem] leading-relaxed text-claimondo-shield">{item.haftung}</p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-claimondo-light-blue transition group-hover:text-claimondo-ondo" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* Rechte (→ B.2 Rechte-Hub + Handbuch) */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('rechte_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('rechte_p')}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            {rechteLinks.map((label, i) => (
              <li key={RECHTE_HREFS[i]}>
                → <Link href={RECHTE_HREFS[i]} className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </section>

        {/* HUK-Konter / Was die Versicherung verschweigt */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            {t('versicherung_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('versicherung_p')}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            {versicherungLinks.map((label, i) => (
              <li key={VERSICHERUNG_HREFS[i]}>
                → <Link href={VERSICHERUNG_HREFS[i]} className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ (sichtbar, ergänzt das FAQPage-Schema) */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('faqs_h2')}
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {faqs.map((f) => (
              <div key={f.frage} className="rounded-ios-md border border-claimondo-border bg-white p-4">
                <p className="font-bold text-claimondo-navy">{f.frage}</p>
                <p className="mt-1 text-[0.92rem] leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </div>
            ))}
          </div>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline={t('cta_band')} />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Cornerstone: Unfall was tun" whatsappHref={WA} />
    </div>
  )
}
