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

// Stream B.4 (Doc 26) — Fahrzeugtyp-Page „E-Auto-Gutachter". Konversions-Framing
// mit e-auto-spezifischen USPs: Hochvolt-Batterie-Diagnose, schnellerer
// wirtschaftlicher Totalschaden, merkantile Wertminderung, ADAS-Kalibrierung.
// Quelle: Pillar-B (wertminderung/wiederbeschaffungswert/reparaturkosten) + SV-Hub.

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF

export const metadata: Metadata = {
  title: 'E-Auto-Gutachter nach Unfall — Hochvolt-Schaden korrekt bewerten · Claimondo',
  description:
    'E-Auto-Gutachten nach unverschuldetem Unfall: spezialisierter Sachverständiger mit Hochvolt-Batterie-Diagnose, korrekter Wertminderung und Wirtschaftlichkeitsprüfung. Die Kosten trägt die gegnerische Haftpflicht (§ 249 BGB) — für Sie 0 €.',
  keywords: [
    'e-auto gutachter', 'elektroauto gutachter unfall', 'e-auto sachverständiger',
    'elektroauto schaden gutachten', 'hochvolt batterie gutachten', 'e-auto wertminderung',
    'elektrofahrzeug gutachter', 'e-auto totalschaden',
  ],
  alternates: { canonical: '/e-auto-gutachter' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/e-auto-gutachter`,
    title: 'E-Auto-Gutachter nach Unfall — Hochvolt-Schaden korrekt bewerten',
    description:
      'Spezialisierter Sachverständiger mit Hochvolt-Batterie-Diagnose, Wertminderung & Wirtschaftlichkeitsprüfung. Kosten trägt die gegnerische Haftpflicht (§ 249 BGB).',
  },
}

// Leistungsumfang eines qualifizierten E-Auto-Gutachtens (Check-Grid).
const UMFANG = [
  'Hochvolt-Batterie-Diagnose — auch verdeckte Zell- & Modulschäden',
  'Struktur- & Crashrahmen-Prüfung (Batterieschutz)',
  'Kalibrierung von Assistenzsystemen (ADAS, Sensorik, Kameras)',
  'Merkantile Wertminderung — marktkritischer Batteriezustand',
  'Wirtschaftlichkeit: Reparatur vs. Wiederbeschaffung',
  'Spezialwerkstatt & Hochvolt-Freischaltung berücksichtigt',
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Warum braucht ein E-Auto einen spezialisierten Gutachter?',
    antwort:
      'Die Hochvolt-Batterie ist die teuerste und sicherheitsrelevanteste Komponente. Ihre Bewertung sowie die Prüfung von Karosseriestruktur, Sensorik und Assistenzsystemen erfordern Fachkompetenz — ein Standard-Gutachten übersieht diese Werte leicht.',
  },
  {
    frage: 'Wird die Batterie nach einem Unfall geprüft?',
    antwort:
      'Ein qualifiziertes E-Auto-Gutachten umfasst die Hochvolt-Diagnose — auch ohne sichtbare Schäden, da Zell- oder Modulschäden verdeckt sein können und die Sicherheit sowie den Restwert betreffen.',
  },
  {
    frage: 'Wer zahlt den E-Auto-Gutachter?',
    antwort:
      'Bei unverschuldetem Unfall der gegnerische Haftpflichtversicherer als eigenständige Schadensposition (§ 249 BGB, BGH VI ZR 67/06) — für Sie 0 €. Sie wählen Ihren eigenen, unabhängigen Sachverständigen frei.',
  },
  {
    frage: 'Habe ich Anspruch auf Wertminderung beim E-Auto?',
    antwort:
      'Ja. Die merkantile Wertminderung ist eine eigenständige Schadensposition und bei E-Autos oft besonders relevant, weil der Markt den Batteriezustand nach einem Schaden kritisch bewertet (BGH VI ZR 357/03).',
  },
  {
    frage: 'Warum führt ein kleiner Unfall beim E-Auto schneller zum Totalschaden?',
    antwort:
      'Schon moderate Schäden im Batterie- oder Strukturbereich können hohe Reparaturkosten verursachen. Ein frühes Gutachten klärt, ob Reparatur oder Wiederbeschaffung wirtschaftlich ist — und sichert die korrekte Abrechnung.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'E-Auto-Gutachten nach Unfall',
            description:
              'Unabhängiges Schadensgutachten für Elektrofahrzeuge nach unverschuldetem Unfall: Hochvolt-Batterie-Diagnose, Struktur- und Assistenzsystem-Prüfung, merkantile Wertminderung und Wirtschaftlichkeitsbewertung. Für unverschuldet Geschädigte 0 € (§ 249 BGB, gegnerischer Haftpflichtversicherer trägt die Kosten).',
            url: `${SITE_URL}/e-auto-gutachter`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'E-Auto-Gutachter', url: '/e-auto-gutachter' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">Start</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">E-Auto-Gutachter</span>
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
              § 249 BGB · Freie Gutachterwahl · Hochvolt-Kompetenz
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              E-Auto-Gutachter nach unverschuldetem Unfall
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Beim Elektroauto entscheidet die Hochvolt-Batterie über die Schadenshöhe — und verdeckte
              Zellschäden bleiben ohne Fachdiagnose unentdeckt. Ein spezialisierter, unabhängiger
              Sachverständiger sichert den vollen Anspruch. Bei unverschuldetem Unfall trägt die Kosten die
              gegnerische Haftpflicht — <strong className="text-white">für Sie 0 €</strong>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/gutachter-finden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                E-Auto-Sachverständigen finden
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
            Die Batterie entscheidet — lassen Sie sie fachkundig prüfen
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Nach einem unverschuldeten Unfall wählen Sie Ihren eigenen, unabhängigen Sachverständigen frei
            (§ 249 BGB). Bei Elektrofahrzeugen ist die Hochvolt-Diagnose entscheidend: Schon moderate Schäden
            können die Batterie oder die Schutzstruktur betreffen und über Reparatur oder Totalschaden
            entscheiden. Die Honorarkosten trägt der gegnerische Haftpflichtversicherer (BGH VI ZR 67/06).
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              'Eigener, Hochvolt-erfahrener Sachverständiger',
              'Batterie-Diagnose auch bei verdeckten Schäden',
              'Merkantile Wertminderung korrekt beziffert',
              'Honorar nach BVSK-Tabelle erstattungsfähig',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Leistungsumfang */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Was ein qualifiziertes E-Auto-Gutachten umfasst
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Über den klassischen Karosserieschaden hinaus deckt ein fachgerechtes Elektro-Gutachten ab:
          </p>
          <div className="mt-4 rounded-ios-md border border-claimondo-border bg-white p-6">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {UMFANG.map((t) => (
                <li key={t} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Vertiefung / Cross-Links */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            Ihre Ansprüche im Detail
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            <li>
              → <Link href="/haftpflicht/wertminderung" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Wertminderung: merkantiler Minderwert nach Reparatur</Link>
            </li>
            <li>
              → <Link href="/haftpflicht/wiederbeschaffungswert" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Wiederbeschaffungswert beim Totalschaden</Link>
            </li>
            <li>
              → <Link href="/haftpflicht/reparaturkosten" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Reparaturkosten & fiktive Abrechnung</Link>
            </li>
            <li>
              → <Link href="/sachverstaendige" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Sachverständigen-Verbände & Qualifikation erklärt</Link>
            </li>
          </ul>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline="E-Auto unverschuldet beschädigt? Hol dir die volle Bewertung — 0 €." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: E-Auto-Gutachter" whatsappHref={WA} />
    </div>
  )
}
