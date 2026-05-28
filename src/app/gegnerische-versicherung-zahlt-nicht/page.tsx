import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import {
  serviceSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'

// Stream B.2 (Doc 26) — Misstrauens-Page „Gegnerische Versicherung zahlt nicht".
// Faengt die Verzugs-/Kuerzungs-Keywords (versicherung zahlt nicht / reagiert
// nicht / kuerzt schaden). Konversions-Framing: typische Versicherer-Taktiken
// entschluesseln (Verlinkung in den Decoder-Cluster) + Verzug/Zinsen/Anwalt.
// Quelle: Decoder-Spokes + Pillar-B (verzug-bgb286 / verzugszinsen / anwaltskosten).
// Anker = decoder-Variante (Doc 26 B.2 DoD „Decoder-CTA-Block").

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('gegnerische_versicherung_zahlt_nicht.title'),
    description: t('gegnerische_versicherung_zahlt_nicht.description'),
    keywords: [
      'gegnerische versicherung zahlt nicht', 'versicherung zahlt nicht nach unfall',
      'haftpflicht zahlt nicht', 'versicherung reagiert nicht', 'versicherung kürzt schaden',
      'schadenregulierung dauert zu lange', 'versicherung zahlt nicht was tun', '§ 286 BGB Verzug',
    ],
    alternates: {
      canonical: '/gegnerische-versicherung-zahlt-nicht',
      ...buildLanguageAlternates('/gegnerische-versicherung-zahlt-nicht'),
    },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/gegnerische-versicherung-zahlt-nicht`,
      title: t('gegnerische_versicherung_zahlt_nicht.og_title'),
      description: t('gegnerische_versicherung_zahlt_nicht.og_description'),
    },
  }
}

// Typische Versicherer-Taktiken → der passende Decoder. Sichtbarer Decoder-Block
// (Doc 26 B.2 DoD). Slugs aus src/content/claimondo/decoder/ — alle real (sonst
// 404 wegen dynamicParams=false).
// href-Werte bleiben als Code-Konstante; brief+bedeutung kommen per t.raw('taktiken').
const TAKTIKEN_HREFS: string[] = [
  '/decoder/wir-pruefen-sachverhalt',
  '/decoder/pauschal-abgeltung',
  '/decoder/mietwagen-zu-hoch',
  '/decoder/nutzungsausfall-nicht',
  '/decoder/wertminderung-nicht',
  '/decoder/reparatur-unwirtschaftlich',
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was kann ich tun, wenn die gegnerische Versicherung nicht zahlt?',
    antwort:
      'Bei unverschuldetem Unfall haben Sie nach § 249 BGB Anspruch auf vollständigen Schadensersatz. Zahlt der gegnerische Haftpflichtversicherer nach angemessener Prüffrist (in der Regel 4–6 Wochen) nicht oder nur gekürzt, gerät er in Verzug (§ 286 BGB). Sie müssen dann nicht verhandeln: Unsere Partnerkanzlei für Verkehrsrecht setzt die Ansprüche mit BGH-fundierter Begründung durch — bei unverschuldetem Unfall für Sie kostenfrei.',
  },
  {
    frage: 'Wie lange darf eine Versicherung mit der Regulierung warten?',
    antwort:
      'Dem Versicherer steht eine angemessene Prüffrist zu — bei klarer Haftungslage typisch 4–6 Wochen ab vollständiger Schadensunterlage. Danach tritt Verzug ein (§ 286 BGB) und es entstehen Verzugszinsen in Höhe von 5 Prozentpunkten über dem Basiszinssatz (§ 288 Abs. 1 BGB).',
  },
  {
    frage: 'Die Versicherung kürzt meine Rechnung — muss ich das hinnehmen?',
    antwort:
      'Nein. Kürzungen bei Sachverständigen-Honorar, Mietwagen oder Reparatur sind häufig unberechtigt. Nach BGH VI ZR 280/22 trägt das Werkstatt- und Sachverständigen-Risiko der Schädiger, nicht der Geschädigte — Sie müssen weder das günstigste Angebot wählen noch fremde Rechnungen überwachen.',
  },
  {
    frage: 'Wer zahlt den Anwalt, wenn ich gegen die Versicherung vorgehe?',
    antwort:
      'Bei unverschuldetem Unfall sind die Kosten der außergerichtlichen anwaltlichen Vertretung erforderlicher Herstellungsaufwand nach § 249 BGB — der gegnerische Haftpflichtversicherer trägt sie. Für Sie entstehen keine Eigenkosten.',
  },
  {
    frage: 'Was bedeutet eine „Teilregulierung" oder „Pauschalabgeltung"?',
    antwort:
      'Ein Vergleichsangebot unterhalb des tatsächlichen Schadens. Sie sind nicht verpflichtet, es anzunehmen. Erst ein unabhängiges Gutachten beziffert Reparatur, Wertminderung und Nutzungsausfall vollständig — Grundlage, um den Restbetrag durchzusetzen.',
  },
]

export default function Page() {
  const t = useTranslations('gegnerische_vs')
  const taktiken = t.raw('taktiken') as Array<{ brief: string; bedeutung: string }>
  const antwortBullets = t.raw('antwort_bullets') as string[]
  const hebelLinks = t.raw('hebel_links') as string[]
  const verwandtLinks = t.raw('verwandt_links') as string[]

  const HEBEL_HREFS = [
    '/haftpflicht/verzug-bgb286',
    '/haftpflicht/verzugszinsen-bgb288',
    '/haftpflicht/anwaltskosten-erstattung',
    '/haftpflicht/sv-kosten',
  ]
  const VERWANDT_HREFS = [
    '/versicherung-schickt-gutachter',
    '/unverschuldeter-unfall-rechte',
    '/unfall-was-tun-als-geschaedigter',
    '/schadensreport-2026',
  ]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Durchsetzung gegen die gegnerische Haftpflichtversicherung',
            description:
              'Wenn die gegnerische Haftpflichtversicherung nach unverschuldetem Unfall nicht oder nur gekürzt zahlt: Verzug nach § 286 BGB, Verzugszinsen nach § 288 BGB und Durchsetzung aller Ansprüche über eine Partnerkanzlei für Verkehrsrecht — für unverschuldet Geschädigte 0 €.',
            url: `${SITE_URL}/gegnerische-versicherung-zahlt-nicht`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Gegnerische Versicherung zahlt nicht', url: '/gegnerische-versicherung-zahlt-nicht' },
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

        {/* Antwort-zuerst-Block */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('antwort_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('antwort_p')}
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {antwortBullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {bullet}
              </li>
            ))}
          </ul>
        </section>

        {/* Decoder-Block: Taktiken entschluesseln */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('taktiken_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('taktiken_p')}
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {taktiken.map((item, i) => (
              <Link
                key={TAKTIKEN_HREFS[i]}
                href={TAKTIKEN_HREFS[i]}
                className="group flex items-start justify-between gap-4 rounded-ios-md border border-claimondo-border bg-white p-4 transition hover:border-claimondo-ondo/40 hover:bg-claimondo-bg"
              >
                <div>
                  <p className="font-bold text-claimondo-navy">{item.brief}</p>
                  <p className="mt-1 text-[0.9rem] leading-relaxed text-claimondo-shield">{item.bedeutung}</p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-claimondo-light-blue transition group-hover:text-claimondo-ondo" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* Verzug / Zinsen / Anwalt */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            {t('hebel_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('hebel_p')}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            {hebelLinks.map((label, i) => (
              <li key={HEBEL_HREFS[i]}>
                → <Link href={HEBEL_HREFS[i]} className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Doc 37 §6: Misstrauens-Trio-Sibling-Web — Geschwister-Seiten + Cornerstone-Anker. */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            {t('verwandt_h2')}
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            {verwandtLinks.map((label, i) => (
              <li key={VERWANDT_HREFS[i]}>
                {/* Doc 37 §8.1 (inbound): Coup-Asset als Daten-Beleg — letzter Link. */}
                → <Link href={VERWANDT_HREFS[i]} className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </section>

        <ConversionAnchorBlock variant="decoder" />
        <SpokeCtaBand headline={t('cta_band')} />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: Versicherung zahlt nicht" whatsappHref={WA} />
    </div>
  )
}
