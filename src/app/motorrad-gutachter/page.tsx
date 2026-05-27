import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import {
  serviceSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'

// Stream B.4 (Doc 26) — Fahrzeugtyp-Page „Motorrad-Gutachter" (höchster
// Value-per-Visitor laut F-006). Konversions-Framing mit motorrad-spezifischen
// USPs: Sturz-/Rahmenschäden, Schutzkleidung als Schadensposition, höhere
// Totalschaden-Quote, Wertminderung, Nutzungsausfall (einzelfallabhängig).
// Quelle: Pillar-B-Querschnitt (wertminderung/nutzungsausfall/sv-kosten).

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF

export const metadata: Metadata = {
  title: 'Motorrad-Gutachter nach Unfall — unabhängig & kostenlos · Claimondo',
  description:
    'Motorrad-Gutachter nach unverschuldetem Unfall: unabhängiger Sachverständiger, korrekte Bewertung von Sturz- und Rahmenschäden. Kosten trägt die Gegnerseite.',
  keywords: [
    'motorrad gutachter', 'motorradgutachter unfall', 'kfz gutachter motorrad',
    'motorrad sachverständiger', 'gutachter motorradschaden', 'motorrad wertminderung',
    'motorrad totalschaden gutachten', 'schutzkleidung ersatz unfall',
  ],
  alternates: { canonical: '/motorrad-gutachter' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/motorrad-gutachter`,
    title: 'Motorrad-Gutachter nach Unfall — unabhängig & kostenlos',
    description:
      'Eigener Sachverständiger, Schutzkleidung als Schadensposition, Wertminderung & Totalschaden korrekt bewertet. Kosten trägt die gegnerische Haftpflicht (§ 249 BGB).',
  },
}

// FAQS: nur für JSON-LD (faqPageSchema) — NICHT sichtbar gerendert.
const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Brauche ich nach einem Motorradunfall ein eigenes Gutachten?',
    antwort:
      'Oberhalb der Bagatellgrenze von etwa 750 € lohnt sich ein unabhängiges Gutachten — es dokumentiert auch verdeckte Rahmen- und Sturzschäden und beziffert die Wertminderung (BGH VI ZR 357/03). Bei unverschuldetem Unfall trägt die Kosten der gegnerische Haftpflichtversicherer (§ 249 BGB).',
  },
  {
    frage: 'Werden Helm und Schutzkleidung mit ersetzt?',
    antwort:
      'Ja. Bei einem Sturz beschädigte Schutzausrüstung — Helm, Motorradkombi, Protektoren, Handschuhe und Stiefel — ist eine eigenständige, erstattungsfähige Schadensposition nach § 249 BGB. Bewahren Sie die beschädigten Teile als Nachweis auf.',
  },
  {
    frage: 'Wer zahlt den Motorrad-Gutachter?',
    antwort:
      'Bei unverschuldetem Unfall der gegnerische Haftpflichtversicherer als eigenständige Schadensposition (§ 249 BGB, BGH VI ZR 67/06) — für Sie 0 €. Sie wählen Ihren eigenen, unabhängigen Sachverständigen frei.',
  },
  {
    frage: 'Bekomme ich Nutzungsausfall für mein Motorrad?',
    antwort:
      'Ein Nutzungsausfall kommt in Betracht, wenn Sie auf das Motorrad angewiesen sind und es nicht nur als reines Freizeit-Zweitfahrzeug nutzen — die Bewertung ist einzelfallabhängig. Alternativ sind die Kosten eines Mietfahrzeugs erstattungsfähig.',
  },
  {
    frage: 'Lohnt sich ein Gutachten auch beim Totalschaden?',
    antwort:
      'Gerade dann: Nur ein unabhängiges Gutachten ermittelt Wiederbeschaffungs- und Restwert korrekt und verhindert eine zu niedrige Abrechnung durch den Versicherer.',
  },
]

const CROSS_HREFS = [
  '/haftpflicht/wertminderung',
  '/haftpflicht/nutzungsausfall',
  '/kosten-kfz-gutachten',
  '/haftpflicht/sv-kosten',
]

export default function Page() {
  const t = useTranslations('motorrad_gutachter')

  const antwortBullets = t.raw('antwort_bullets') as string[]
  const punkte = t.raw('punkte') as Array<{ titel: string; text: string }>
  const crosslinks = t.raw('crosslinks') as string[]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Motorrad-Gutachten nach Unfall',
            description:
              'Unabhängiges Schadensgutachten für Motorräder nach unverschuldetem Unfall: Bewertung von Sturz- und Rahmenschäden, Schutzkleidung, Wertminderung und Totalschaden. Honorar nach BVSK-Tabelle, für unverschuldet Geschädigte 0 € (§ 249 BGB, gegnerischer Haftpflichtversicherer trägt die Kosten).',
            url: `${SITE_URL}/motorrad-gutachter`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Motorrad-Gutachter', url: '/motorrad-gutachter' },
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
              {t.rich('hero_intro', {
                strong: (chunks) => <strong className="text-white">{chunks}</strong>,
              })}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/gutachter-finden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                {t('hero_cta')}
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
            {antwortBullets.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Motorrad-spezifisch */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            {t('daten_h2')}
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            {t('daten_p')}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {punkte.map((p) => (
              <div key={p.titel} className="rounded-ios-md border border-claimondo-border bg-white p-4">
                <p className="font-bold text-claimondo-navy">{p.titel}</p>
                <p className="mt-1 text-[0.9rem] leading-relaxed text-claimondo-shield">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Vertiefung / Cross-Links */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            {t('crosslinks_h2')}
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            {crosslinks.map((label, i) => (
              <li key={label}>
                → <Link href={CROSS_HREFS[i]} className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline={t('cta_band')} />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: Motorrad-Gutachter" whatsappHref={WA} />
    </div>
  )
}
