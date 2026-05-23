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

// Stream B.1 (Doc 26) — Konversions-Hub „Kosten Kfz-Gutachten". Fängt die
// Kosten-Variant-Keywords (was kostet kfz gutachter / bvsk honorartabelle / wer
// zahlt gutachter). Conversion-Framing statt Wissens-Spoke; Quelle: Spoke
// /haftpflicht/sv-kosten + BVSK-Methodik. Compliance: BVSK methodisch als
// Korridore + Verweis bvsk.de, KEIN 1:1-Abdruck der BVSK-Tabelle (AGENTS.md).

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF

export const metadata: Metadata = {
  title: 'Was kostet ein Kfz-Gutachten? Für Geschädigte 0 € · Claimondo',
  description:
    'Was kostet ein Kfz-Gutachten nach Unfall? Honorare orientieren sich an der BVSK-Honorartabelle (typisch 300–1.200 €) — bei unverschuldetem Unfall trägt sie nach § 249 BGB die gegnerische Haftpflichtversicherung. Für Sie 0 €.',
  keywords: [
    'was kostet kfz gutachter', 'kosten kfz gutachten', 'bvsk honorartabelle',
    'wer zahlt gutachter nach unfall', 'gutachten kosten erstattung', 'sachverständigen kosten',
    '§ 249 BGB', 'kfz gutachten kostenlos',
  ],
  alternates: { canonical: '/kosten-kfz-gutachten' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/kosten-kfz-gutachten`,
    title: 'Was kostet ein Kfz-Gutachten? Für Geschädigte 0 €',
    description:
      'BVSK-Honorartabelle erklärt + warum unverschuldet Geschädigte 0 € zahlen (§ 249 BGB, BGH VI ZR 67/06).',
  },
}

// BVSK-Honorarstufen — methodische Korridore (Orientierung), KEIN 1:1-Abdruck.
// Konsistent mit dem Spoke /haftpflicht/sv-kosten.
const BVSK_STUFEN = [
  { stufe: 'HB I', schaden: 'bis 750 €', honorar: 'ca. 200–280 €' },
  { stufe: 'HB II', schaden: '750–1.500 €', honorar: 'ca. 280–400 €' },
  { stufe: 'HB III', schaden: '1.500–5.000 €', honorar: 'ca. 400–700 €' },
  { stufe: 'HB IV', schaden: '5.000–15.000 €', honorar: 'ca. 600–1.200 €' },
  { stufe: 'HB V', schaden: 'über 15.000 €', honorar: 'individuell, oft 1.000–2.500 €' },
] as const

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was kostet ein Kfz-Gutachten nach einem unverschuldeten Unfall?',
    antwort:
      'Die Sachverständigenkosten orientieren sich an der BVSK-Honorartabelle und liegen für Standard-Fälle typisch zwischen 300 € und 1.200 € je nach Schadenshöhe. Bei unverschuldetem Unfall trägt sie nach § 249 BGB der gegnerische Haftpflichtversicherer — für Sie 0 €.',
  },
  {
    frage: 'Wer zahlt den Kfz-Gutachter nach dem Unfall?',
    antwort:
      'Bei unverschuldetem Unfall zahlt die gegnerische Haftpflichtversicherung die Gutachterkosten als eigenständige Schadensposition (§ 249 BGB, BGH VI ZR 67/06) — auch ohne spätere Klage.',
  },
  {
    frage: 'Darf die Versicherung das Gutachter-Honorar kürzen?',
    antwort:
      'Honorare innerhalb der BVSK-Tabelle sind als Schätzgrundlage nach § 287 ZPO grundsätzlich erstattbar (BGH VI ZR 357/13). Auch ein überhöhtes Honorar geht nach BGH VI ZR 280/22 zu Lasten der Versicherung — das Sachverständigen-Risiko trägt nicht der Geschädigte.',
  },
  {
    frage: 'Muss ich den von der Versicherung vorgeschlagenen Gutachter nehmen?',
    antwort:
      'Nein. Sie wählen Ihren eigenen, unabhängigen Sachverständigen nach § 249 BGB frei — den „Vertrauens-Gutachter" der Gegenseite müssen Sie nicht akzeptieren. Eine Karte mit Partner-Sachverständigen finden Sie unter https://claimondo.de/gutachter-finden.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachten — Kosten & Erstattung',
            description:
              'Unabhängiges Kfz-Schadensgutachten nach unverschuldetem Unfall. Honorar nach BVSK-Honorartabelle, für unverschuldet Geschädigte 0 € (§ 249 BGB, gegnerischer Haftpflichtversicherer trägt die Kosten).',
            url: `${SITE_URL}/kosten-kfz-gutachten`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Kosten Kfz-Gutachten', url: '/kosten-kfz-gutachten' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">Start</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Kosten Kfz-Gutachten</span>
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
              § 249 BGB · BVSK-Honorartabelle · BGH VI ZR 67/06
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              Was kostet ein Kfz-Gutachten — und wer zahlt es?
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Die Honorare orientieren sich an der BVSK-Honorartabelle (typisch 300–1.200 € je nach Schadenshöhe).
              Bei unverschuldetem Unfall trägt sie der gegnerische Haftpflichtversicherer — <strong className="text-white">für Sie 0 €</strong>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/gutachter-finden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                Sachverständigen finden
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-3.5 font-bold text-white transition hover:bg-white/10">
                <Phone className="h-4 w-4" aria-hidden />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </header>

        {/* 0-€-Block */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Für unverschuldet Geschädigte: 0 € Eigenkosten
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Sachverständigenkosten sind eine eigenständige Schadensposition nach § 249 BGB — der gegnerische
            Haftpflichtversicherer trägt sie vollständig (BGH VI ZR 67/06), unabhängig davon, ob es später zur
            Klage kommt. Auch Anwalts-, Reparatur- und Mietwagenkosten zahlt die Gegenseite (vorbehaltlich
            Anerkenntnis durch den gegnerischen Haftpflichtversicherer).
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {['Eigener, unabhängiger Sachverständiger — freie Wahl', 'Beauftragung durch Sie, nicht den Versicherer', 'Honorar nach BVSK-Tabelle erstattungsfähig', 'Vor Reparatur-Beginn beauftragen (Beweissicherung)'].map((t) => (
              <li key={t} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* BVSK-Honorarstufen */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Honorarhöhe nach BVSK-Honorartabelle
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Die BVSK-Honorartabelle ordnet das Honorar gestuft nach Schadenshöhe ein und ist als
            Schätzgrundlage nach § 287 ZPO anerkannt (BGH VI ZR 357/13). Die folgenden Korridore sind
            Orientierung — die exakten Werte ergeben sich aus der jeweils aktuellen{' '}
            <a href="https://www.bvsk.de/" target="_blank" rel="noopener noreferrer" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">BVSK-Tabelle</a>{' '}
            plus Auslagen (Lichtbilder, Fahrtkosten, Schreibgebühr, MwSt.).
          </p>
          <div className="mt-4 overflow-hidden rounded-ios-md border border-claimondo-border">
            <table className="w-full border-collapse text-[0.9375rem]">
              <thead>
                <tr className="bg-claimondo-bg text-left text-xs uppercase tracking-wide text-claimondo-shield">
                  <th className="px-4 py-3 font-bold">Honorar-Stufe</th>
                  <th className="px-4 py-3 font-bold">Schadenshöhe</th>
                  <th className="px-4 py-3 font-bold">Honorar-Korridor (orientiert)</th>
                </tr>
              </thead>
              <tbody>
                {BVSK_STUFEN.map((r) => (
                  <tr key={r.stufe} className="border-t border-claimondo-border">
                    <td className="px-4 py-3 font-bold text-claimondo-navy">{r.stufe}</td>
                    <td className="px-4 py-3 text-claimondo-shield">{r.schaden}</td>
                    <td className="px-4 py-3 text-claimondo-shield">{r.honorar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Versicherer-Kürzung */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            „Das Honorar ist überhöht" — was die Versicherung kürzt
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Versicherer-Prüfdienste kürzen Sachverständigen-Honorare regelmäßig mit dem Argument, sie seien
            „überhöht". Nach BGH VI ZR 280/22 trägt das Sachverständigen-Risiko jedoch die Versicherung — Sie
            müssen weder das günstigste Angebot wählen noch das Honorar überwachen. Wie Sie auf die typischen
            Schreiben reagieren:
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            <li>
              → <Link href="/decoder/unser-sachverstaendiger" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">„Wir schicken unseren Gutachter" — Decoder</Link>
            </li>
            <li>
              → <Link href="/haftpflicht/sv-kosten" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Sachverständigen-Kosten: Anspruch & Erstattung im Detail</Link>
            </li>
          </ul>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline="Unverschuldeter Unfall? Gutachten kostet dich 0 €." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: Kosten-Hub" whatsappHref={WA} />
    </div>
  )
}
