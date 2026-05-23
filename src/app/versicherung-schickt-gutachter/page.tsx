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

// Stream B.2 (Doc 26) — Misstrauens-Page „Versicherung schickt Gutachter".
// Faengt die freie-Gutachterwahl-Keywords (versicherung schickt gutachter /
// vertrauensgutachter / gutachter der versicherung ablehnen). Konversions-Framing:
// freie Wahl des eigenen, unabhaengigen SV (§ 249 BGB) — der Pruefdienst der
// Gegenseite ist nicht neutral. Quelle: Decoder unser-sachverstaendiger + Spoke
// sv-kosten. Anker = decoder-Variante (Doc 26 B.2 DoD „Decoder-CTA-Block").

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF

export const metadata: Metadata = {
  title: 'Versicherung schickt Gutachter — muss ich das akzeptieren? · Claimondo',
  description:
    'Die gegnerische Versicherung will „ihren" Gutachter schicken? Sie müssen ihn nicht akzeptieren: Nach § 249 BGB wählen Sie Ihren eigenen, unabhängigen Sachverständigen frei. Die Kosten trägt bei unverschuldetem Unfall die Gegenseite (BGH VI ZR 67/06) — für Sie 0 €.',
  keywords: [
    'versicherung schickt gutachter', 'gegnerische versicherung schickt gutachter',
    'muss ich gutachter der versicherung akzeptieren', 'gutachter der versicherung ablehnen',
    'eigener gutachter nach unfall', 'vertrauensgutachter versicherung', 'freie gutachterwahl unfall',
    '§ 249 BGB freie sachverständigenwahl',
  ],
  alternates: { canonical: '/versicherung-schickt-gutachter' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/versicherung-schickt-gutachter`,
    title: 'Versicherung schickt Gutachter — muss ich das akzeptieren?',
    description:
      'Nein. Freie Wahl des eigenen, unabhängigen Sachverständigen nach § 249 BGB. Kosten trägt der gegnerische Haftpflichtversicherer (BGH VI ZR 67/06).',
  },
}

// Ihr SV vs. Pruefdienst der Versicherung — Vergleichstabelle (GEO: Comparison-Data).
const VERGLEICH: Array<{ kriterium: string; eigen: string; versicherer: string }> = [
  { kriterium: 'Auftraggeber', eigen: 'Sie als Geschädigte:r', versicherer: 'Die gegnerische Versicherung' },
  { kriterium: 'Interesse', eigen: 'Vollständige Schadenshöhe', versicherer: 'Möglichst niedrige Regulierung' },
  { kriterium: 'Wertminderung', eigen: 'Wird gesondert ermittelt', versicherer: 'Oft nicht ausgewiesen' },
  { kriterium: 'Beweiswert', eigen: 'Unabhängiges Gutachten', versicherer: 'Partei-Einschätzung' },
  { kriterium: 'Ihre Kosten', eigen: '0 € (§ 249 BGB)', versicherer: '—' },
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Muss ich den Gutachter der gegnerischen Versicherung akzeptieren?',
    antwort:
      'Nein. Bei unverschuldetem Unfall wählen Sie Ihren eigenen, unabhängigen Sachverständigen nach § 249 BGB frei. Den von der Versicherung vorgeschlagenen „Vertrauens-Gutachter" müssen Sie nicht akzeptieren — ein bereits angekündigter Besichtigungstermin der Gegenseite bindet Sie nicht.',
  },
  {
    frage: 'Ist der Gutachter der Versicherung neutral?',
    antwort:
      'Er wird von der Versicherung beauftragt und bezahlt und dient deren Interesse an einer möglichst niedrigen Regulierung. Ein eigenes, unabhängiges Gutachten sichert dagegen Ihre Position — es weist auch die merkantile Wertminderung aus, die in Prüfdienst-Kalkulationen häufig fehlt.',
  },
  {
    frage: 'Wer zahlt mein eigenes Gutachten?',
    antwort:
      'Bei unverschuldetem Unfall trägt die Sachverständigenkosten der gegnerische Haftpflichtversicherer als eigenständige Schadensposition (§ 249 BGB, BGH VI ZR 67/06) — für Sie entstehen 0 € Eigenkosten.',
  },
  {
    frage: 'Was, wenn die Versicherung schon einen Termin mit ihrem Gutachter vereinbart hat?',
    antwort:
      'Sie können jederzeit einen eigenen Sachverständigen beauftragen. Beauftragen Sie ihn am besten vor Reparaturbeginn — das eigene Gutachten dient der Beweissicherung und dokumentiert den Schaden vollständig, bevor Spuren verschwinden.',
  },
  {
    frage: 'Ab welchem Schaden lohnt sich ein eigenes Gutachten?',
    antwort:
      'Oberhalb der Bagatellgrenze von etwa 750 € lohnt sich ein unabhängiges Gutachten — nur dieses beziffert die Wertminderung (BGH VI ZR 357/03). Bei kleineren Schäden genügt häufig ein Kostenvoranschlag.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Freie Wahl des eigenen Kfz-Sachverständigen',
            description:
              'Nach unverschuldetem Unfall wählen Geschädigte ihren eigenen, unabhängigen Sachverständigen frei (§ 249 BGB) — der „Vertrauens-Gutachter" der gegnerischen Versicherung ist nicht verpflichtend. Die Gutachterkosten trägt der gegnerische Haftpflichtversicherer (BGH VI ZR 67/06).',
            url: `${SITE_URL}/versicherung-schickt-gutachter`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Versicherung schickt Gutachter', url: '/versicherung-schickt-gutachter' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">Start</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Versicherung schickt Gutachter</span>
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
              § 249 BGB · Freie Gutachterwahl · BGH VI ZR 67/06
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              „Wir schicken Ihnen unseren Gutachter" — müssen Sie das akzeptieren?
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Nein. Bei unverschuldetem Unfall wählen Sie Ihren eigenen, unabhängigen Sachverständigen frei
              (§ 249 BGB). Der „Vertrauens-Gutachter" der Gegenseite arbeitet für die Versicherung —
              <strong className="text-white"> Ihr Gutachten kostet Sie 0 €</strong>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/gutachter-finden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                Eigenen Sachverständigen finden
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
            Sie haben die freie Wahl — nicht die Versicherung
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Das Recht auf einen eigenen, unabhängigen Sachverständigen folgt direkt aus dem Anspruch auf
            Naturalrestitution (§ 249 BGB). Der von der gegnerischen Versicherung gestellte oder bezahlte
            Gutachter ist nicht neutral — er dient dem Interesse, die Regulierung niedrig zu halten. Beauftragen
            Sie Ihr eigenes Gutachten am besten vor Reparaturbeginn (Beweissicherung).
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              'Eigener, unabhängiger Sachverständiger — freie Wahl',
              'Termin des Versicherer-Gutachters bindet Sie nicht',
              'Honorar nach BVSK-Tabelle erstattungsfähig',
              'Wertminderung wird gesondert ausgewiesen',
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
            Ihr Sachverständiger vs. der Prüfdienst der Versicherung
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Beide ermitteln einen Schaden — aber im Auftrag verschiedener Interessen. Der Unterschied entscheidet
            über Ihre Erstattung:
          </p>
          <div className="mt-4 overflow-hidden rounded-ios-md border border-claimondo-border">
            <table className="w-full border-collapse text-[0.9375rem]">
              <thead>
                <tr className="bg-claimondo-bg text-left text-xs uppercase tracking-wide text-claimondo-shield">
                  <th className="px-4 py-3 font-bold">Kriterium</th>
                  <th className="px-4 py-3 font-bold">Ihr eigener Sachverständiger</th>
                  <th className="px-4 py-3 font-bold">Prüfdienst der Versicherung</th>
                </tr>
              </thead>
              <tbody>
                {VERGLEICH.map((r) => (
                  <tr key={r.kriterium} className="border-t border-claimondo-border">
                    <td className="px-4 py-3 font-bold text-claimondo-navy">{r.kriterium}</td>
                    <td className="px-4 py-3 text-claimondo-shield">{r.eigen}</td>
                    <td className="px-4 py-3 text-claimondo-shield">{r.versicherer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Vertiefung / Cross-Links */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            Mehr zur freien Sachverständigenwahl
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            <li>
              → <Link href="/decoder/unser-sachverstaendiger" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">„Wir schicken unseren Gutachter" — der Brief-Decoder</Link>
            </li>
            <li>
              → <Link href="/kosten-kfz-gutachten" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Was kostet ein Kfz-Gutachten — und wer zahlt es?</Link>
            </li>
            <li>
              → <Link href="/haftpflicht/sv-kosten" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Sachverständigen-Kosten: Anspruch & Erstattung</Link>
            </li>
            <li>
              → <Link href="/sachverstaendige" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">BVSK, DEKRA, GTÜ & Co. — Sachverständigen-Verbände erklärt</Link>
            </li>
          </ul>
        </section>

        <ConversionAnchorBlock variant="decoder" />
        <SpokeCtaBand headline="Eigenen Gutachter statt Versicherer-Prüfer — kostet dich 0 €." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: Versicherung schickt Gutachter" whatsappHref={WA} />
    </div>
  )
}
