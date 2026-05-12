import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, Calculator, TrendingDown, Scale } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Wertminderung nach Unfall berechnen — Sanden/Danner-Formel & BGH-Linie',
  description:
    'Wie viel Wertminderung steht Ihnen zu? Sanden/Danner-Formel, Faustregel-Tabelle nach Fahrzeugalter, BGH-Rechtsprechung. Typische Werte 500–2.500 €. Ohne Gutachten verloren.',
  keywords: [
    'Wertminderung nach Unfall',
    'Wertminderung berechnen',
    'merkantile Wertminderung',
    'Sanden Danner Formel',
    'Wertminderung Faustregel',
    'BGH VI ZR 357/03',
    'Wertminderung Tabelle',
  ],
  alternates: { canonical: '/kfz-gutachter/wertminderung' },
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/kfz-gutachter/wertminderung`,
    title: 'Wertminderung berechnen — Sanden/Danner & BGH-Linie',
    description: 'Typische Wertminderung 500–2.500 € — wir holen sie für Sie zurück.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Wertminderung berechnen' }],
  },
}

const FAUSTREGEL = [
  { jahr: '1. Jahr', faktor: '25 %', beispiel: '10.000 € Reparatur → 2.500 € Wertminderung' },
  { jahr: '2. Jahr', faktor: '20 %', beispiel: '10.000 € Reparatur → 2.000 € Wertminderung' },
  { jahr: '3. Jahr', faktor: '15 %', beispiel: '10.000 € Reparatur → 1.500 € Wertminderung' },
  { jahr: '4. Jahr', faktor: '10 %', beispiel: '10.000 € Reparatur → 1.000 € Wertminderung' },
  { jahr: 'ab 5. Jahr', faktor: 'Einzelfall', beispiel: 'Abhängig von Laufleistung & Marktwert' },
]

const FAQS = [
  {
    frage: 'Was ist merkantile Wertminderung?',
    antwort:
      'Merkantile Wertminderung ist der Wertverlust eines reparierten Unfallfahrzeugs gegenüber einem unfallfreien Vergleichsfahrzeug — auch nach perfekter Reparatur. Käufer zahlen für Unfallwagen weniger, das ist Marktrealität. Der Schadensersatz nach §249 BGB umfasst genau diese Differenz. Ohne Gutachten wird sie nicht berechnet, von der Versicherung also auch nicht gezahlt.',
  },
  {
    frage: 'Wie wird Wertminderung konkret berechnet?',
    antwort:
      'In Deutschland mit der Sanden/Danner-Formel oder Variationen davon (Halbgewachs, BVSK-Methode). Eingangsgrößen: Reparaturkosten, Wiederbeschaffungswert, Fahrzeugalter, Laufleistung, Vorschäden, Marktverhältnisse. Faustregel als Einstieg: 1. Jahr 25 % der Reparaturkosten, dann jährlich -5 %. Genaue Berechnung macht der Gutachter.',
  },
  {
    frage: 'Bekomme ich auch bei einem 10 Jahre alten Auto Wertminderung?',
    antwort:
      'Möglich, wenn das Fahrzeug einen relevanten Marktwert hat. Der BGH (VI ZR 357/03) lehnt eine starre Altersgrenze ab. OLG Oldenburg hat sogar bei 200.000 km Laufleistung Wertminderung zuerkannt. Entscheidend: ist das Fahrzeug noch verkäuflich am Markt, gibt es einen Unfallschaden-Abschlag bei Käufern? Bei alten Fahrzeugen kann die Wertminderung gering sein (200–500 €), aber Anspruch besteht.',
  },
  {
    frage: 'Warum lehnt die Versicherung Wertminderung ab?',
    antwort:
      'Standard-Taktik: "Bei Ihrem Fahrzeug nicht mehr berechtigt" oder "im Reparaturpreis enthalten". Beides ist meist unzutreffend. Ohne Gutachter-Bericht zur Wertminderung können Sie nichts begründen — die Versicherung zahlt einfach nichts. Mit Gutachten + Anwalt holen wir die Wertminderung in der Regel zurück. Bei Streit klagen wir.',
  },
  {
    frage: 'Wie hoch ist Wertminderung bei Tesla oder anderen E-Autos?',
    antwort:
      'Bei E-Fahrzeugen oft DEUTLICH höher als das Standard-Schema rechnet. Grund: Käufer haben Sorgen wegen Akku-Schäden, auch wenn die nicht betroffen sind. Praxisbeispiel Tesla Model 3: Reparaturkosten 18.000 € → realistische Wertminderung 4.000 € statt der 1.800 € nach Standard-Sanden/Danner. Spezial-Gutachter sind hier essentiell.',
  },
]

export default function WertminderungPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Wertminderung-Gutachten nach Unfall',
            description:
              'Berechnung und Durchsetzung der merkantilen Wertminderung nach Verkehrsunfall. Sanden/Danner-Formel, BGH-Rechtsprechung VI ZR 357/03, typische Werte 500–2.500 €.',
            url: `${SITE_URL}/kfz-gutachter/wertminderung`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Wertminderung', url: '/kfz-gutachter/wertminderung' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Wertminderung</span>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Wertminderung nach Unfall
          </h1>
          <p className="mt-3 text-lg text-claimondo-light-blue">
            Sanden/Danner-Formel · BGH-Linie · typische Werte <strong className="text-white">500–2.500 €</strong>
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="§249 BGB · BGH VI ZR 357/03">
            <strong>Auch nach perfekter Reparatur sinkt der Marktwert eines Unfallfahrzeugs.</strong>
            Diese merkantile Wertminderung muss die gegnerische Haftpflichtversicherung erstatten.
            Faustregel: 1. Jahr nach Erstzulassung = 25 % der Reparaturkosten, 2. Jahr = 20 %,
            3. Jahr = 15 %, 4. Jahr = 10 %. BGH lehnt starre Altersgrenze ab — auch bei
            200.000 km kann Anspruch bestehen. Berechnung macht der Sachverständige.
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            Faustregel-Tabelle nach Fahrzeugalter
          </h2>
          <DataTableContainer variant="plain" className="mt-6 overflow-hidden rounded-2xl border border-claimondo-border bg-white shadow-sm">
            <Table>
              <Thead>
                <Tr>
                  <Th className="!font-bold">Alter</Th>
                  <Th className="!font-bold">Faktor</Th>
                  <Th className="!font-bold">Beispiel-Berechnung</Th>
                </Tr>
              </Thead>
              <Tbody>
                {FAUSTREGEL.map((row) => (
                  <Tr key={row.jahr}>
                    <Td className="font-semibold">{row.jahr}</Td>
                    <Td className="font-bold !text-claimondo-ondo">{row.faktor}</Td>
                    <Td className="!text-claimondo-shield">{row.beispiel}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
          <p className="mt-3 text-xs text-claimondo-ondo">
            Faustregel als Orientierung. Genaue Berechnung mit Sanden/Danner-Formel
            durch zertifizierten Sachverständigen — berücksichtigt Laufleistung,
            Marktwert, Vorschäden, Reparatur-Qualität.
          </p>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            Sanden/Danner-Formel — wie wird genau gerechnet?
          </h2>
          <AnswerCapsule>
            Die Sanden/Danner-Formel berücksichtigt: Reparaturkosten, Wiederbeschaffungswert,
            Fahrzeugalter (Erstzulassung bis Schadenereignis), Laufleistung, Vorschäden,
            Marktrelevanz. Die Variation Halbgewachs gewichtet zusätzlich den Schwere-
            grad des Unfalls. BVSK-Methode kombiniert beide Ansätze. In der Praxis nutzen
            Sachverständige die Formel als Ausgangspunkt + Marktbeobachtung, um den
            realen Wertverlust zu ermitteln.
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            Versicherung lehnt Wertminderung ab — was tun?
          </h2>
          <AnswerCapsule quelle="BGH VI ZR 357/03">
            <strong>Häufige Versicherungs-Argumente</strong> wie "Fahrzeug zu alt" oder
            "im Reparaturpreis enthalten" sind in den meisten Fällen unzutreffend. Der
            BGH hat die Wertminderung als eigenständigen Schadensposten anerkannt, der
            unabhängig von Reparaturkosten zu erstatten ist. Mit Gutachten + Anwalt
            holen wir die Wertminderung standardmäßig zurück — bei Streit klagen wir
            mit Aussicht auf Erfolg.
          </AnswerCapsule>
        </div>
      </section>

      {/* Sonderfälle */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Sonderfälle</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Calculator,
                titel: 'Tesla / E-Auto',
                text: 'Wertminderung oft 2-3× höher als Standard-Schema. Käufer-Sorgen wegen Akku trotz unbeschädigter Batterie. Nur Spezial-Gutachter holen das raus.',
              },
              {
                icon: TrendingDown,
                titel: 'Oldtimer (>30 J.)',
                text: 'Wertminderung über Sammlerwert berechnet. Reparatur-Qualität kritisch — Originalteile, Zertifikate, Provenienz. Gutachter mit Oldtimer-Erfahrung Pflicht.',
              },
              {
                icon: Scale,
                titel: 'Leasing / Finanzierung',
                text: 'Bei Leasing-Fahrzeugen geht der Wertminderung-Anspruch in der Regel an die Leasing-Bank. Bei Finanzierung an Sie. Genauer Vertrag entscheidet.',
              },
            ].map((s) => {
              const Icon = s.icon
              return (
                <div key={s.titel} className="rounded-2xl border border-claimondo-border bg-claimondo-bg p-5">
                  <Icon className="h-6 w-6 text-claimondo-ondo" />
                  <h3 className="mt-3 text-base font-bold text-claimondo-navy">{s.titel}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Häufige Fragen zur Wertminderung</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.frage} className="group rounded-2xl border border-claimondo-border bg-white p-5">
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy">
                  <span className="flex items-center justify-between">
                    {f.frage}
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-Links */}
      <section className="bg-claimondo-bg py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-lg font-bold text-claimondo-navy">Mehr zum Thema</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/kfz-gutachter/kosten" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              Was kostet ein Gutachter?
            </Link>
            <Link href="/kfz-gutachter/ablauf" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              Ablauf der Schadensregulierung
            </Link>
            <Link href="/kfz-gutachter" className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield">
              Gutachter finden →
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Wertminderung gesichert holen</h2>
          <p className="mt-4 text-white/70">Ohne Gutachten ist die Wertminderung verloren. Wir berechnen + holen sie für Sie zurück.</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/schaden-melden" className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90">
              Schaden melden
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a href="tel:+4922125906530" className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/85 hover:border-white/40 hover:text-white">
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Kfz-Gutachter Wertminderung" />
    </div>
  )
}
