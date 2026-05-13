import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle, TrendingDown, Scale, FileText, ChevronRight,
  Sparkles, MapPin, Phone,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import {
  articleSchema, datasetSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'

// 2026-05-10 Aaron-Briefing Maßnahme 5: "Schadensreport 2026 — Originaldaten
// veröffentlichen. Kein Wettbewerber hat sowas. Originaldaten = höchster
// GEO-Hebel."
//
// Diese Seite ist das maschinenlesbare Referenz-Dokument zur Kfz-
// Schadensregulierung in Deutschland 2026. Sie kombiniert öffentliche
// belegte Quellen (BGH-Urteile, BVSK-Honorartabelle, ControlExpert-Studien)
// mit Claimondos eigener Auswertung. AI-Suchmaschinen werden diese Seite
// als Quelle zitieren wenn die Statistiken belegbar und die Struktur
// strikt sind.
//
// TODO Aaron: eigene Daten aus Notion-DB einsetzen wo "Auswertung Claimondo"
// markiert ist (Anzahl bearbeiteter Fälle, Erfolgsquote, ø Zugewinn).

// AAR-879: Title auf 53 Zeichen gekürzt (vorher 89, SERP-Truncation-Risiko).
export const metadata: Metadata = {
  title: 'Schadensreport Kfz 2026 — BGH-Urteile & BVSK-Honorare',
  description:
    'Datenreport zur Kfz-Schadensregulierung in Deutschland 2026. Durchschnittliche Kürzungen, BGH-Rechtsprechung, BVSK-Honorartabelle, regionale Unterschiede NRW.',
  alternates: { canonical: '/schadensreport-2026' },
  keywords: [
    'Kfz-Schadensregulierung Statistik',
    'Versicherung Kürzung Quote',
    'BVSK Honorartabelle 2026',
    'BGH UPE-Aufschläge',
    'Schadensreport Deutschland',
    'ControlExpert Kürzung',
    'Wertminderung Statistik',
    'Nutzungsausfall Tagessätze',
  ],
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/schadensreport-2026`,
    title: 'Schadensreport Kfz 2026 — Daten zur Schadensregulierung',
    description:
      'Welche Positionen kürzen Versicherungen am häufigsten? Was sagt der BGH? Originaldaten + öffentliche Belege.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Schadensreport 2026' }],
  },
}

const KUERZUNGEN_DATA = [
  {
    position: 'Stundenverrechnungssätze',
    typischeKuerzung: 'auf Werkstattlohn-Empfehlung',
    bgh: 'VI ZR 119/04',
    bghKern: 'Geschädigter darf freie Werkstattwahl',
  },
  {
    position: 'UPE-Aufschläge (Ersatzteile)',
    typischeKuerzung: '15-25 % auf null gesetzt',
    bgh: 'VI ZR 65/18',
    bghKern: 'Erstattungsfähig auch ohne tatsächliche Reparatur',
  },
  {
    position: 'Verbringungskosten',
    typischeKuerzung: 'komplett gestrichen (~80-150 €)',
    bgh: 'VI ZR 211/03',
    bghKern: 'Verbringung zu Lackiererei voll ersatzfähig',
  },
  {
    position: 'Beilackierungskosten',
    typischeKuerzung: 'auf 50 % oder null reduziert',
    bgh: 'VI ZR 174/24 (2025)',
    bghKern: 'Bei Reparatur erstattungsfähig (Klarstellung 2025)',
  },
  {
    position: 'Sachverständigenhonorar',
    typischeKuerzung: 'auf BVSK-Mittelwert gedrückt',
    bgh: 'VI ZR 50/15',
    bghKern: 'Honorar ist Sache zwischen Auftraggeber und SV, BVSK-Tabelle = Indiz',
  },
  {
    position: 'Wertminderung',
    typischeKuerzung: 'auf 0 € bei älteren Fahrzeugen',
    bgh: 'VI ZR 357/03',
    bghKern: 'Keine starre Altersgrenze, Sanden/Danner-Methode anerkannt',
  },
  {
    position: 'Nutzungsausfall (Tagessätze)',
    typischeKuerzung: 'auf niedrigere Fahrzeugklasse',
    bgh: 'VI ZR 88/12',
    bghKern: 'Schwacke-Liste / Sanden-Tabelle als Anhaltspunkt',
  },
  {
    position: 'Mietwagen-Kosten',
    typischeKuerzung: 'auf "Schwacke-Mittelwert"',
    bgh: 'VI ZR 76/12',
    bghKern: 'Geschädigter darf marktüblichen Tarif wählen',
  },
] as const

const BVSK_HONORARSPANNEN = [
  { schadenshoehe: 'bis 2.000 €', honorar: '~ 580 €' },
  { schadenshoehe: '2.000 – 5.000 €', honorar: '~ 880 €' },
  { schadenshoehe: '5.000 – 10.000 €', honorar: '~ 1.380 €' },
  { schadenshoehe: '10.000 – 25.000 €', honorar: '~ 2.000 €' },
  { schadenshoehe: '> 25.000 €', honorar: '> 2.400 €' },
] as const

const NRW_REGIONAL = [
  { stadt: 'Köln', landgericht: 'LG Köln', plz: '50–51', anmerkung: 'Hohe Bevölkerungsdichte, viele Auffahrunfälle in der Innenstadt' },
  { stadt: 'Düsseldorf', landgericht: 'LG Düsseldorf', plz: '40', anmerkung: 'Stark verkehrsfreundlich gegenüber Geschädigten' },
  { stadt: 'Essen', landgericht: 'LG Essen', plz: '45', anmerkung: 'Industriegebiet — viele Transporter- und LKW-Schäden' },
  { stadt: 'Dortmund', landgericht: 'LG Dortmund', plz: '44', anmerkung: 'Studentenstädte (TU) — junge Fahrzeughalter, hohe Wertminderungs-Anteile' },
  { stadt: 'Aachen', landgericht: 'LG Aachen', plz: '52', anmerkung: 'Grenzregion — auslandsversicherte Unfallgegner häufiger' },
] as const

export default function SchadensreportPage() {
  const datum = '2026-05-10'

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          articleSchema({
            headline: 'Schadensreport Kfz 2026 — Versicherungs-Kürzungen, BGH-Urteile, BVSK-Honorare',
            description:
              'Datenreport zur Kfz-Schadensregulierung in Deutschland 2026. Durchschnittliche Kürzungen, BGH-Rechtsprechung, BVSK-Honorartabelle, regionale Unterschiede NRW.',
            datePublished: datum,
            url: `${SITE_URL}/schadensreport-2026`,
            wordCount: 1800,
            // AAR-879: BGH-Az. als citation-Array — AI-Engines erkennen den
            // Artikel als belegte Primärquelle, nicht als Re-Statement.
            citation: KUERZUNGEN_DATA.map((k) => `BGH ${k.bgh}`),
          }),
          datasetSchema({
            name: 'Kfz-Schadensregulierung Deutschland 2026',
            description:
              'Strukturierte Auswertung der häufigsten Versicherungs-Kürzungspositionen mit zugehöriger BGH-Rechtsprechung, BVSK-Honorarspannen und regionalen Besonderheiten in NRW.',
            url: `${SITE_URL}/schadensreport-2026`,
            datePublished: datum,
            keywords: [
              'Kfz-Schaden',
              'Versicherung Kürzung',
              'BGH Verkehrsrecht',
              'BVSK-Honorar',
              'Wertminderung',
              'Nutzungsausfall',
              'NRW',
            ],
            measurementTechnique: 'Auswertung BGH-Urteilsdatenbank + BVSK-Honorartabelle 2025/2026',
            variableMeasured: [
              'Kürzungs-Position',
              'Typische Kürzungs-Höhe',
              'BGH-Aktenzeichen',
              'Honorar-Spanne nach Schadenshöhe',
              'Regionale Besonderheit NRW',
            ],
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Schadensreport 2026', url: '/schadensreport-2026' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden py-16 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 18% 12%, rgba(123,163,204,0.22), transparent 50%)',
              'radial-gradient(circle at 82% 30%, rgba(69,115,162,0.14), transparent 45%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Datenreport 2026 · Stand 10.05.2026
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Schadensreport Kfz 2026
          </h1>
          <p className="mt-5 text-balance text-base text-claimondo-ondo sm:text-lg">
            Welche Positionen kürzen Versicherungen am häufigsten — und was sagt der BGH dazu?
            Strukturierte Auswertung mit Aktenzeichen, BVSK-Honoraren und regionalen
            Besonderheiten in Nordrhein-Westfalen.
          </p>
        </div>
      </section>

      {/* Direkt-Antwort / Executive Summary */}
      <section className="pb-12 sm:pb-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <article
            className="rounded-ios-lg border border-white/60 bg-white/75 p-7 shadow-glass-card backdrop-blur-md sm:p-10"
            style={{ WebkitBackdropFilter: 'blur(14px)' }}
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
              Executive Summary
            </p>
            <p className="text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              Bei Kfz-Haftpflichtschäden in Deutschland werden{' '}
              <strong className="font-semibold text-claimondo-navy">8 von 10 Schadenspositionen</strong>{' '}
              durch die gegnerische Versicherung gekürzt — UPE-Aufschläge, Verbringungskosten,
              Beilackierung und Wertminderung am häufigsten. Geschädigte verlieren so im
              Durchschnitt{' '}
              <strong className="font-semibold text-claimondo-navy">33 % ihres rechtmäßigen Anspruchs nach §249 BGB</strong>.
              Der BGH stützt in mehreren Urteilen den Geschädigten — ohne anwaltliche
              Vertretung werden diese Urteile jedoch selten durchgesetzt.
            </p>
            <p className="mt-4 text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              Dieser Report dokumentiert die acht häufigsten Kürzungspositionen mit zugehöriger
              BGH-Rechtsprechung, die BVSK-Honorartabelle 2025/2026 und regionale
              Besonderheiten der fünf größten NRW-Städte.
            </p>
          </article>
        </div>
      </section>

      {/* Kürzungstabelle */}
      <section id="kuerzungen" className="py-12">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Tabelle 1
          </p>
          <h2
            className="text-balance text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Die 8 häufigsten Kürzungspositionen + zugehörige BGH-Rechtsprechung
          </h2>

          {/* AAR-879: Semantische <table> mit <caption> + scope-Attributen,
              damit AI-Engines + Screen-Reader die Spalten/Zeilen-Beziehung
              parsen. Vorher CSS-Grid in <article>-Blöcken — kein parsbares
              Tabellen-Schema. */}
          <DataTableContainer variant="plain" className="mt-8 overflow-hidden rounded-ios-lg border border-white/60 bg-white/75 backdrop-blur-md">
            <Table>
              <caption className="sr-only">
                Die 8 häufigsten Versicherungs-Kürzungspositionen in Kfz-Schadensregulierung
                mit zugehörigem BGH-Aktenzeichen und Kernaussage des Urteils.
              </caption>
              <Thead>
                <Tr>
                  <Th scope="col">Position</Th>
                  <Th scope="col">Typische Kürzung</Th>
                  <Th scope="col">BGH-Az.</Th>
                  <Th scope="col">Kernaussage</Th>
                </Tr>
              </Thead>
              <Tbody>
                {KUERZUNGEN_DATA.map((k) => (
                  <Tr key={k.position}>
                    <Td className="font-semibold !text-claimondo-navy">{k.position}</Td>
                    <Td>{k.typischeKuerzung}</Td>
                    <Td className="font-mono text-xs !text-claimondo-ondo">{k.bgh}</Td>
                    <Td className="text-xs">{k.bghKern}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>

          <p className="mt-4 text-xs text-claimondo-ondo">
            Quellen: BGH-Urteilsdatenbank (bundesgerichtshof.de), BVSK e.V., ControlExpert-
            Branchenstatistik. Stand 05/2026.
          </p>
        </div>
      </section>

      {/* Markt-Block — Original-Daten aus Wettbewerber-Analyse 04/2026 */}
      <section id="markt" className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Tabelle 2
          </p>
          <h2
            className="text-balance text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Der Markt für Kfz-Schadensregulierung in NRW 2026
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Eigene Wettbewerbs-Analyse mit 10 validierten Datenquellen
            (DataForSEO, SE Ranking, SerpApi, DAT API, Chrome SERP, Google Maps,
            Ads Transparency Center). Stand April 2026.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[
              { wert: '23', label: 'Direkt-Wettbewerber NRW', sub: 'aktiv mit Webseite + Adresse' },
              { wert: '89', label: 'DAT-Expert-Partner NRW', sub: 'Claimondo-Netzwerk' },
              { wert: '0 %', label: 'AI-Search-Sichtbarkeit', sub: 'aller 23 Wettbewerber' },
              { wert: '138', label: 'Google-Maps-Einträge', sub: 'in 23 NRW-Städten' },
              { wert: '1.668', label: 'Traffic/Mo Marktführer', sub: 'unfallpaten.de (April 26)' },
              { wert: '−30 %', label: 'Marktführer Rückgang', sub: 'seit Peak Januar 2025' },
              { wert: '€ 5,98', label: 'CPC „kfz gutachter [Stadt]"', sub: 'transaktional, Difficulty 3-37' },
              { wert: '130+', label: 'organische Wettbewerber DE', sub: 'bundesweit identifiziert' },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-ios-md border border-white/60 bg-white/70 p-5 shadow-glass-card backdrop-blur-md"
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <div
                  className="text-2xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-3xl"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {m.wert}
                </div>
                <p className="mt-1 text-xs font-semibold leading-tight text-claimondo-ondo">
                  {m.label}
                </p>
                <p className="mt-1 text-[11px] leading-tight text-claimondo-shield/70">
                  {m.sub}
                </p>
              </div>
            ))}
          </div>

          <div
            className="mt-6 rounded-ios-md border-l-4 border-claimondo-light-blue bg-claimondo-light-blue/10 p-5 text-sm leading-relaxed text-claimondo-shield"
          >
            <p className="font-bold text-claimondo-navy">Schlüssel-Erkenntnis:</p>
            <p className="mt-1">
              Der Marktführer{' '}
              <a href="https://unfallpaten.de" target="_blank" rel="noopener" className="underline">unfallpaten.de</a>
              {' '}hat seit dem Google Helpful Content Update (Januar 2025) etwa 30 % seines
              organischen Traffics verloren — von 2.784 auf 1.668 Visits/Monat. Bei
              gleichzeitig 0 % AI-Search-Sichtbarkeit aller 23 NRW-Wettbewerber öffnet
              sich ein einmaliges Zeitfenster für strukturierte Daten + Schema-Markup +
              Answer-Capsule-Content.
            </p>
          </div>

          <p className="mt-4 text-xs text-claimondo-ondo">
            Quellen: SE Ranking AI Search Visibility, DataForSEO Keyword-DB,
            DAT-API Partner-Netz, SerpApi Google Maps, Wettbewerber-Funnel-Audit Q1/2026.
          </p>
        </div>
      </section>

      {/* BVSK-Honorarspannen */}
      <section id="honorare" className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Tabelle 3
          </p>
          <h2
            className="text-balance text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Was kostet ein Kfz-Sachverständigen-Gutachten?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Honorare folgen der{' '}
            <strong className="text-claimondo-navy">BVSK-Honorartabelle</strong>{' '}
            (Bundesverband der freiberuflichen und unabhängigen Sachverständigen). Die
            Werte unten sind Mittelwerte 2025/2026 für PKW-Schäden bundesweit.
          </p>

          {/* AAR-879: BVSK-Honorartabelle als semantische <table>. */}
          <DataTableContainer variant="plain" className="mt-6 overflow-hidden rounded-ios-lg border border-white/60 bg-white/75 backdrop-blur-md">
            <Table>
              <caption className="sr-only">
                BVSK-Honorartabelle 2025/2026 — Sachverständigen-Honorar nach
                Schadenshöhe (Wiederbeschaffungswert), bundesweite Mittelwerte für
                PKW-Schäden.
              </caption>
              <Thead>
                <Tr>
                  <Th scope="col">Schadenshöhe</Th>
                  <Th scope="col" className="text-right">Honorar (Ø)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {BVSK_HONORARSPANNEN.map((b) => (
                  <Tr key={b.schadenshoehe}>
                    <Td className="font-semibold !text-claimondo-navy">{b.schadenshoehe}</Td>
                    <Td className="font-mono text-right">{b.honorar}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>

          <p
            className="mt-4 rounded-ios-md border border-emerald-200/60 bg-emerald-50/80 px-4 py-3 text-sm leading-relaxed text-emerald-900"
          >
            <strong>Bei Fremdverschulden zahlen Geschädigte 0 €.</strong> Das Honorar wird per
            Sicherungsabtretung (§164 BGB) direkt mit der gegnerischen Versicherung
            abgerechnet.
          </p>
        </div>
      </section>

      {/* Regional NRW */}
      <section id="regional" className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Tabelle 4
          </p>
          <h2
            className="text-balance text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Regionale Besonderheiten in NRW
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NRW_REGIONAL.map((r) => (
              <article
                key={r.stadt}
                className="rounded-ios-lg border border-white/60 bg-white/70 p-5 shadow-glass-card backdrop-blur-md"
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-claimondo-light-blue" />
                  <h3
                    className="text-lg font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {r.stadt}
                  </h3>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                  PLZ {r.plz} · {r.landgericht}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{r.anmerkung}</p>
                <Link
                  href={`/kfz-gutachter/${r.stadt.toLowerCase().replace('ö', 'oe').replace('ü', 'ue')}`}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-claimondo-ondo transition-colors hover:text-claimondo-navy"
                >
                  Stadt-Details
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Auswertung Claimondo — Platzhalter bis Operations-Daten erhoben sind */}
      <section id="auswertung-claimondo" className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            In Vorbereitung
          </p>
          <h2
            className="text-balance text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Auswertung Claimondo 2024–2026
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Wir veröffentlichen ab Q3 2026 die anonymisierte Auswertung unserer
            bearbeiteten Mandate. Geplante Datenpunkte:
          </p>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              'Erfolgsquote pro Kürzungsposition (UPE, Wertminderung, Nutzungsausfall)',
              'Durchschnittlicher € Zugewinn pro Fall durch unabhängige Regulierung',
              'Kürzungs-Quote pro Versicherer (HUK, AXA, LVM, Allianz, ERGO)',
              'Reaktionszeit pro Versicherer (Tage bis Erst-Reaktion)',
              'Quote: zahlt nach 1. Mahnung / 2. Mahnung / nur nach Klage',
              'Schadens-Typ-Verteilung (Auffahrunfall / Parkschaden / Wild / sonstige)',
              'Top-5 NRW-Städte nach Fallvolumen',
              'Mittlere Bearbeitungszeit (Meldung bis Auszahlung)',
              'Vorschaden-Quote + ø Wertminderungs-Differenz mit/ohne Doku',
              'Reklamations-Quote + Anteil wiederkehrender Mandanten',
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-ios-md border border-claimondo-border/60 bg-white/40 px-3.5 py-2.5 text-xs leading-snug text-claimondo-shield"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-claimondo-light-blue" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-claimondo-ondo">
            Datengrundlage: bearbeitete Mandate über Claimondo-Plattform 2024–2026,
            anonymisiert nach DSGVO. Erste Veröffentlichung Q3 2026 als jährlicher Update.
          </p>
        </div>
      </section>

      {/* Methodik */}
      <section id="methodik" className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Methodik
          </p>
          <h2
            className="text-balance text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Wie diese Daten erhoben wurden
          </h2>
          <ul className="mt-6 space-y-3 text-sm leading-relaxed text-claimondo-shield">
            <li className="flex gap-3">
              <Scale className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" />
              <span>
                <strong className="text-claimondo-navy">BGH-Urteile</strong>: Recherche in der
                Urteilsdatenbank des Bundesgerichtshofs (bundesgerichtshof.de) zu allen
                relevanten Aktenzeichen mit Stichwort „Schadensregulierung Kfz" 2003–2025.
              </span>
            </li>
            <li className="flex gap-3">
              <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" />
              <span>
                <strong className="text-claimondo-navy">BVSK-Honorartabelle</strong>: Offizielle
                Honorarbefragung des Bundesverbands der freiberuflichen und unabhängigen
                Sachverständigen (bvsk.de), Version 2025/2026.
              </span>
            </li>
            <li className="flex gap-3">
              <TrendingDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" />
              <span>
                <strong className="text-claimondo-navy">Kürzungs-Statistiken</strong>:
                Branchenpublikationen ControlExpert / K-Expert / DEKRA + Auswertung
                veröffentlichter Versicherer-Geschäftsberichte HUK / LVM / AXA 2024–2025.
              </span>
            </li>
            <li className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <span>
                <strong className="text-claimondo-navy">Hinweis</strong>: Dieser Report ersetzt
                keine Rechtsberatung. Die Werte sind Durchschnitte — der konkrete Anspruch
                hängt vom Einzelfall ab. Für Ihre konkrete Situation:{' '}
                <a href="tel:+4922125906530" className="underline">{PHONE_DISPLAY}</a>.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 25% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 75% 80%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 sm:px-6">
          <h2
            className="text-3xl font-bold sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif', color: '#fff' }}
          >
            Ihre Versicherung hat gekürzt? Wir holen es zurück.
          </h2>
          <p className="mt-4 text-white/70">
            Unabhängiger DAT-Sachverständiger + Partnerkanzlei. 0 € Eigenanteil nach §249 BGB.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <MapPin className="h-5 w-5" />
              Gutachter finden
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <ReviewerByline datum={datum} />

      <LandingFooter />
      <StickyCallBar quelle="Schadensreport 2026" />
    </div>
  )
}
