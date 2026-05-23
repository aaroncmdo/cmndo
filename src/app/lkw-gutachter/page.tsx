import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, Check } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import {
  serviceSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'

// Stream B.4 (Doc 26) — Fahrzeugtyp-Page „LKW-/Nutzfahrzeug-Gutachter".
// Konversions-Framing mit nutzfahrzeug-spezifischen USPs: gewerblicher
// Ausfallschaden (Vorhaltekosten / entgangener Gewinn) statt Pkw-Pauschale,
// Aufbauten-/Sonderausstattungs-Bewertung. Quelle: Pillar-B (nutzungsausfall/
// sv-kosten/wiederbeschaffungswert).

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF

export const metadata: Metadata = {
  title: 'LKW- & Nutzfahrzeug-Gutachter nach Unfall · Claimondo',
  description:
    'LKW-, Transporter- und Nutzfahrzeug-Gutachten nach unverschuldetem Unfall: eigener Sachverständiger, korrekte Bewertung von Aufbauten und Sonderausstattung, gewerblicher Ausfallschaden (Vorhaltekosten statt Pauschale). Kosten trägt die gegnerische Haftpflicht (§ 249 BGB).',
  keywords: [
    'lkw gutachter', 'nutzfahrzeug gutachter', 'lkw sachverständiger unfall',
    'transporter gutachter', 'gutachter lkw schaden', 'betriebsausfall lkw unfall',
    'nutzungsausfall lkw', 'vorhaltekosten nutzfahrzeug',
  ],
  alternates: { canonical: '/lkw-gutachter' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/lkw-gutachter`,
    title: 'LKW- & Nutzfahrzeug-Gutachter nach Unfall',
    description:
      'Eigener Sachverständiger, gewerblicher Ausfallschaden (Vorhaltekosten / entgangener Gewinn) statt Pkw-Pauschale, Aufbauten korrekt bewertet. Kosten trägt die gegnerische Haftpflicht (§ 249 BGB).',
  },
}

// Pkw-Pauschale vs. gewerblicher Ausfall — Vergleichstabelle (GEO: Comparison-Data).
const VERGLEICH: Array<{ kriterium: string; pkw: string; nutzfahrzeug: string }> = [
  { kriterium: 'Grundlage', pkw: 'Nutzungsausfall-Tabelle (pauschal)', nutzfahrzeug: 'Konkreter Ausfallschaden' },
  { kriterium: 'Berechnung', pkw: 'Tagessatz nach Fahrzeugklasse', nutzfahrzeug: 'Vorhaltekosten / entgangener Gewinn / Mietfahrzeug' },
  { kriterium: 'Typische Höhe', pkw: 'eher niedrig', nutzfahrzeug: 'meist deutlich höher' },
  { kriterium: 'Bewertung', pkw: 'Standardumfang', nutzfahrzeug: 'inkl. Aufbauten & Sonderausstattung' },
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Wie wird der Ausfall eines LKW entschädigt?',
    antwort:
      'Bei gewerblich genutzten Fahrzeugen tritt an die Stelle der pauschalen Nutzungsausfall-Tabelle der konkrete Ausfallschaden: Vorhaltekosten, entgangener Gewinn oder die Kosten eines Mietfahrzeugs. Diese liegen in der Regel deutlich über den Pkw-Pauschalen — dokumentieren Sie den Ausfall sorgfältig.',
  },
  {
    frage: 'Wer zahlt den LKW-Gutachter?',
    antwort:
      'Bei unverschuldetem Unfall der gegnerische Haftpflichtversicherer als eigenständige Schadensposition (§ 249 BGB, BGH VI ZR 67/06) — für Sie 0 €. Sie wählen Ihren eigenen, unabhängigen Sachverständigen frei.',
  },
  {
    frage: 'Warum ein spezialisierter Nutzfahrzeug-Gutachter?',
    antwort:
      'Aufbauten wie Ladekran, Kühlung oder Ladebordwand, Sonderausstattung und die gewerbliche Bewertung erfordern Fachkompetenz. Ein spezialisierter Sachverständiger erfasst diese Werte vollständig — ein Standard-Pkw-Gutachten übersieht sie oft.',
  },
  {
    frage: 'Gilt das auch für Transporter und Sprinter?',
    antwort:
      'Ja. Die Grundsätze gelten für gewerblich genutzte Fahrzeuge generell — vom Transporter über den Sprinter bis zur Sattelzugmaschine.',
  },
  {
    frage: 'Was tun bei langer Standzeit oder Lieferverzug?',
    antwort:
      'Der unfallbedingte Ausfall — Standkosten, Frachtausfall, entgangener Gewinn — ist als Folgeschaden erstattungsfähig. Bewahren Sie Aufträge, Tourenpläne und Belege als Nachweis auf.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'LKW- & Nutzfahrzeug-Gutachten nach Unfall',
            description:
              'Unabhängiges Schadensgutachten für LKW, Transporter und Nutzfahrzeuge nach unverschuldetem Unfall: Bewertung von Aufbauten und Sonderausstattung, gewerblicher Ausfallschaden (Vorhaltekosten / entgangener Gewinn). Für unverschuldet Geschädigte 0 € (§ 249 BGB, gegnerischer Haftpflichtversicherer trägt die Kosten).',
            url: `${SITE_URL}/lkw-gutachter`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'LKW- & Nutzfahrzeug-Gutachter', url: '/lkw-gutachter' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">Start</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">LKW- & Nutzfahrzeug-Gutachter</span>
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
              § 249 BGB · Freie Gutachterwahl · Gewerblicher Ausfallschaden
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              LKW- & Nutzfahrzeug-Gutachter nach unverschuldetem Unfall
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Beim Nutzfahrzeug zählt mehr als der Blechschaden: Aufbauten, Sonderausstattung und vor allem der
              gewerbliche Ausfall. Ein spezialisierter Sachverständiger sichert den vollen Anspruch.
              Bei unverschuldetem Unfall trägt die Kosten die gegnerische Haftpflicht — <strong className="text-white">für Sie 0 €</strong>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/gutachter-finden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                Nutzfahrzeug-Sachverständigen finden
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
            Der gewerbliche Ausfall ist Ihr größter Hebel
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Steht ein Nutzfahrzeug nach einem unverschuldeten Unfall still, zählt nicht die pauschale Pkw-Tabelle,
            sondern Ihr konkreter Ausfallschaden — Vorhaltekosten, entgangener Gewinn oder ein Ersatzfahrzeug.
            Ein eigener, unabhängiger Sachverständiger (§ 249 BGB) bewertet Fahrzeug, Aufbauten und Ausfall
            vollständig; die Honorarkosten trägt der gegnerische Haftpflichtversicherer (BGH VI ZR 67/06).
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              'Eigener Nutzfahrzeug-Sachverständiger — freie Wahl',
              'Aufbauten & Sonderausstattung korrekt bewertet',
              'Gewerblicher Ausfallschaden statt Pkw-Pauschale',
              'Honorar nach BVSK-Tabelle erstattungsfähig',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Vergleichstabelle */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Ausfall-Entschädigung: Pkw-Pauschale vs. Nutzfahrzeug
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Warum die richtige Berechnungsgrundlage über mehrere hundert Euro pro Tag entscheiden kann:
          </p>
          <div className="mt-4 overflow-hidden rounded-ios-md border border-claimondo-border">
            <table className="w-full border-collapse text-[0.9375rem]">
              <thead>
                <tr className="bg-claimondo-bg text-left text-xs uppercase tracking-wide text-claimondo-shield">
                  <th className="px-4 py-3 font-bold">Kriterium</th>
                  <th className="px-4 py-3 font-bold">Privat-Pkw</th>
                  <th className="px-4 py-3 font-bold">Gewerbliches Nutzfahrzeug</th>
                </tr>
              </thead>
              <tbody>
                {VERGLEICH.map((r) => (
                  <tr key={r.kriterium} className="border-t border-claimondo-border">
                    <td className="px-4 py-3 font-bold text-claimondo-navy">{r.kriterium}</td>
                    <td className="px-4 py-3 text-claimondo-shield">{r.pkw}</td>
                    <td className="px-4 py-3 text-claimondo-shield">{r.nutzfahrzeug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Vertiefung / Cross-Links */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            Ihre Ansprüche im Detail
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            <li>
              → <Link href="/haftpflicht/nutzungsausfall" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Nutzungsausfall & gewerblicher Ausfallschaden</Link>
            </li>
            <li>
              → <Link href="/haftpflicht/wiederbeschaffungswert" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Wiederbeschaffungswert beim Totalschaden</Link>
            </li>
            <li>
              → <Link href="/kosten-kfz-gutachten" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Was kostet das Gutachten — und wer zahlt es?</Link>
            </li>
            <li>
              → <Link href="/haftpflicht/sv-kosten" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Sachverständigen-Kosten: Anspruch & Erstattung</Link>
            </li>
          </ul>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline="Nutzfahrzeug unverschuldet beschädigt? Hol dir den vollen Ausfall — 0 €." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: LKW-Gutachter" whatsappHref={WA} />
    </div>
  )
}
