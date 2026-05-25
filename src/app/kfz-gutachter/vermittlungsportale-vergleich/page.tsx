import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, MapPin, Scale, Check, Minus } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  DataTableContainer, Table, Thead, Tbody, Tr, Th, Td,
} from '@/components/shared/DataTable'
import {
  articleSchema, vermittlerVergleichSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'
import { ladeSvLeads, ladeAktiveSVs } from '@/lib/actions/gutachter-finder-actions'

const PAGE_PATH = '/kfz-gutachter/vermittlungsportale-vergleich'
const STAND = '25.05.2026'

export const metadata: Metadata = {
  title:
    'Kfz-Gutachter-Vermittlungsportale im Vergleich: Claimondo, Neogutachter, Unfallpaten & Unfallgiganten',
  description:
    'Vier Kfz-Gutachter-Vermittlungsplattformen im direkten Vergleich: Claimondo, Neogutachter, Unfallpaten und Unfallgiganten. Wartezeit, Kosten, Leistungsumfang und rechtliche Sicherheit objektiv gegenübergestellt.',
  keywords: [
    'kfz-gutachter vermittlung vergleich',
    'gutachter-vermittlungsportal',
    'neogutachter alternative',
    'unfallpaten alternative',
    'unabhängiger kfz-gutachter finden',
    'kostenloser kfz-gutachter',
    'vermittlungsportal kfz',
  ],
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}${PAGE_PATH}`,
    title: 'Vergleich: 4 Kfz-Gutachter-Plattformen für Unfallgeschädigte 2026',
    description:
      'Claimondo, Neogutachter, Unfallpaten und Unfallgiganten im objektiven Direktvergleich — Kosten, Leistung, rechtliche Sicherheit.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Kfz-Gutachter-Vermittlungsportale im Vergleich' }],
  },
}

// FAQ — speist zugleich das FAQPage-Schema (Princeton GEO: +40 % AI-Citation).
const FAQ = [
  {
    frage: 'Ist die Vermittlung wirklich kostenlos?',
    antwort:
      'Ja. Bei einem unverschuldeten Unfall trägt die gegnerische Haftpflichtversicherung die Kosten des Sachverständigen als Schadensposition nach §249 BGB (BGH VI ZR 67/06) — vorbehaltlich Anerkenntnis der Haftung. Das gilt für alle vier verglichenen Plattformen. Der Sachverständige rechnet über eine Sicherungsabtretung (§164 BGB) direkt mit der Versicherung ab, Sie zahlen 0 €.',
  },
  {
    frage: 'Darf ich den Gutachter trotz Vorschlag der Versicherung selbst wählen?',
    antwort:
      'Ja. Als unverschuldet Geschädigter haben Sie nach §249 BGB das freie Wahlrecht des Sachverständigen. Sie müssen den Gutachter der gegnerischen Versicherung nicht akzeptieren — eine Vermittlungsplattform stellt Ihnen einen unabhängigen Kfz-Gutachter Ihrer Wahl zur Seite.',
  },
  {
    frage: 'Was passiert, wenn die gegnerische Versicherung das Gutachten kürzt?',
    antwort:
      'Versicherer beauftragen Prüfdienste wie ControlExpert und kürzen häufig UPE-Aufschläge, Verbringungskosten und Wertminderung. Der BGH stützt jedoch den Geschädigten (u. a. VI ZR 65/18, VI ZR 174/24). Mit anwaltlicher Begleitung lassen sich Kürzungen meist zurückholen — bei Claimondo übernimmt das die fest integrierte Partnerkanzlei.',
  },
  {
    frage: 'Wie lange dauert ein Gutachten typischerweise?',
    antwort:
      'Die Vor-Ort-Besichtigung erfolgt je nach regionaler Sachverständigen-Dichte meist innerhalb von ein bis zwei Werktagen, das fertige Gutachten folgt in der Regel wenige Tage später. Die gesamte Schadensregulierung bis zur Auszahlung dauert erfahrungsgemäß sechs bis acht Wochen.',
  },
  {
    frage: 'Brauche ich zusätzlich einen Anwalt?',
    antwort:
      'Nicht zwingend, aber dringend empfohlen — auch die Anwaltskosten trägt bei Fremdverschulden die gegnerische Versicherung. Alle vier verglichenen Plattformen binden Rechtsbeistand an. Bei Claimondo ist eine feste Partnerkanzlei in den Ablauf integriert, sodass Reparatur, Wertminderung, Mietwagen, Nutzungsausfall und Schmerzensgeld direkt durchgesetzt werden.',
  },
  {
    frage: 'Wie unterscheidet sich Claimondo konkret von Neogutachter?',
    antwort:
      'Neogutachter vermittelt Ihnen einen passenden Sachverständigen und endet im Wesentlichen mit dieser Vermittlung. Claimondo ist eine gemanagte End-to-End-Regulierung: Ein Fall-Hub steuert den gesamten Weg vom Gutachten über die feste Partnerkanzlei bis zur Auszahlung — und ist als einzige der vier Plattformen mit Whitelabel-Branding auch für Sachverständige als Partner nutzbar.',
  },
]

export default async function VermittlungsportaleVergleichPage() {
  // SV-Netz live aus der DB — identische Definition wie /gutachter-finden
  // (aktive sv_leads + qualifizierte Sachverständige). Nie hardcoden, damit die
  // Zahl automatisch konsistent + UWG-belegbar bleibt.
  const [svLeadsResult, aktiveSVsResult] = await Promise.all([
    ladeSvLeads(),
    ladeAktiveSVs(),
  ])
  const svNetz =
    (svLeadsResult.ok ? svLeadsResult.data.length : 0) +
    (aktiveSVsResult.ok ? aktiveSVsResult.data.length : 0)

  // Verifizierte Vergleichstabelle (Faktencheck 25.05.2026, jede Wettbewerber-
  // Zelle belegt — docs/25.05.2026/vergleich-belege/). Claimondo-SV-Netz live.
  const ROWS: Array<{ kriterium: string; claimondo: string; neo: string; paten: string; giganten: string }> = [
    {
      kriterium: 'Geschäftsmodell',
      claimondo: 'Gemanagte Full-Service-Regulierung — ein Fall-Hub von Gutachten über Partnerkanzlei bis Auszahlung',
      neo: 'Gutachter-Vermittlung (Online-Anfrage → passender Sachverständiger)',
      paten: 'Schadenabwicklung „aus einer Hand" (Gutachter + Rechtsbeistand)',
      giganten: 'Verzeichnis mit Umkreis-Suche (SV, Werkstatt, Anwalt, Abschleppdienst) + Profil-Listings',
    },
    {
      kriterium: 'Erreichbarkeit',
      claimondo: 'Digital + telefonisch rund um die Uhr; Reaktion unter 15 Minuten',
      neo: '„rund um die Uhr", Anfrage „in 30 Sekunden"; Tel. 0160/4873888',
      paten: '„24h Soforthilfe", Hotline 0800 505 50 50',
      giganten: '„Sofort-Vermittlung" + Umkreis-Suche (25–300 km)',
    },
    {
      kriterium: 'SV-Netz-Größe (öffentliche Angabe)',
      claimondo: `Live aus unserem Netz: ${svNetz} Sachverständige (bundesweit, Schwerpunkt NRW) — identisch zur Karte unter /gutachter-finden`,
      neo: 'nicht öffentlich beziffert',
      paten: '„bundesweites Netzwerk" (keine Zahl)',
      giganten: '„Über 250 geprüfte" (Such-Counter 329; kostenpflichtige Premium-Listings)',
    },
    {
      kriterium: 'Vor-Ort-Besichtigung',
      claimondo: 'immer Pflicht',
      neo: 'Standard',
      paten: '„direkt vor Ort"',
      giganten: 'vermittelt Vor-Ort-Sachverständige',
    },
    {
      kriterium: 'Online-only-Gutachten ohne Besichtigung',
      claimondo: 'nein',
      neo: 'nein',
      paten: 'nein',
      giganten: 'nein',
    },
    {
      kriterium: 'Anwaltsanbindung',
      claimondo: 'ja — integrierte feste Partnerkanzlei',
      neo: 'ja (Gutachter + Anwalt)',
      paten: 'ja — „fachkundiger Rechtsbeistand"',
      giganten: 'ja — Rechtsanwalt als Partnerkategorie',
    },
    {
      kriterium: 'Kosten für Geschädigte',
      claimondo: '0 € (§249 BGB, vorbehaltlich Anerkenntnis)',
      neo: '„unverbindlich & kostenlos"',
      paten: '0 € (haftende Versicherung zahlt)',
      giganten: '„Kostenlos für Geschädigte"',
    },
    {
      kriterium: 'Whitelabel/Brand für Sachverständige',
      claimondo: 'ja (einzige der vier)',
      neo: 'nein',
      paten: 'nein',
      giganten: 'nein (kostenpflichtige „Premium Member"-Listings)',
    },
    {
      kriterium: `Trustpilot (Stand ${STAND})`,
      claimondo: 'kein Profil',
      neo: '4,6 · 133 Bewertungen',
      paten: 'kein Profil (extern: Webwiki 3,7)',
      giganten: '4,5 · 14 Bewertungen',
    },
    {
      kriterium: 'Servicegebiet',
      claimondo: 'bundesweit (DE), Schwerpunkt NRW',
      neo: 'deutschlandweit (DE)',
      paten: 'deutschlandweit (DE)',
      giganten: 'deutschlandweit (DE)',
    },
  ]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          articleSchema({
            headline:
              'Kfz-Gutachter-Vermittlungsportale im Vergleich: Claimondo, Neogutachter, Unfallpaten & Unfallgiganten',
            description:
              'Objektiver Direktvergleich der vier deutschen Kfz-Gutachter-Vermittlungsplattformen — Erreichbarkeit, Kosten, Leistungsumfang, rechtliche Sicherheit.',
            datePublished: '2026-05-25',
            dateModified: '2026-05-25',
            url: `${SITE_URL}${PAGE_PATH}`,
            citation: ['LG Bremen 9 O 1720/24', 'BGH VI ZR 67/06', '§ 249 BGB', '§ 164 BGB'],
          }),
          vermittlerVergleichSchema(FAQ),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Vermittlungsportale im Vergleich', url: PAGE_PATH },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
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
        <div className="relative mx-auto max-w-4xl px-5 sm:px-8">
          <nav aria-label="Brotkrumen" className="text-xs text-white/60">
            <Link href="/" className="hover:text-white">Startseite</Link>
            <span className="px-1.5">/</span>
            <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
            <span className="px-1.5">/</span>
            <span className="text-white/80">Vermittlungsportale im Vergleich</span>
          </nav>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            Kfz-Gutachter-Vermittlung im Vergleich
          </p>
          <h1
            className="mt-4 text-balance text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Vermittlungsportale für Kfz-Gutachter im{' '}
            <span className="text-claimondo-light-blue">Direktvergleich</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            Claimondo, Neogutachter, Unfallpaten und Unfallgiganten vermitteln unverschuldet
            Geschädigten einen unabhängigen Kfz-Gutachter. Hier stehen sie objektiv nebeneinander —
            Erreichbarkeit, Kosten, Leistungsumfang und rechtliche Sicherheit, jede Angabe mit Quelle.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <ChevronRight className="h-4 w-4 text-claimondo-ondo" />
              Gutachter-Anfrage stellen
            </Link>
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10"
            >
              <MapPin className="h-4 w-4" />
              Gutachter auf der Karte ansehen
            </Link>
          </div>
        </div>
      </section>

      {/* Was eine Vermittlungsplattform leistet */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Was eine Vermittlungsplattform leistet — und was nicht
          </h2>
          <AnswerCapsule quelle="§249 BGB · LG Bremen 9 O 1720/24">
            <strong>Ein Vermittlungsportal bringt Sie mit einem unabhängigen Kfz-Gutachter zusammen</strong>,
            der Ihr Fahrzeug persönlich vor Ort besichtigt. Die Plattform erstellt das Gutachten nicht
            selbst — sie vermittelt, koordiniert und bindet je nach Modell zusätzlich anwaltliche
            Begleitung an. Ein reines „Online-Gutachten" ohne physische Besichtigung darf eine seriöse
            Plattform seit dem LG-Bremen-Urteil vom 16.01.2026 nicht mehr bewerben.
          </AnswerCapsule>
          <p className="mt-6 text-[15px] leading-relaxed text-claimondo-shield">
            Wichtig ist die Abgrenzung zum Gutachter der gegnerischen Versicherung: Dessen Prüfdienste
            arbeiten im Auftrag des Schädigers und kürzen erfahrungsgemäß systematisch. Als unverschuldet
            Geschädigter haben Sie nach §249 BGB das Recht, einen <strong>unabhängigen Kfz-Gutachter</strong>{' '}
            Ihrer Wahl zu beauftragen — genau diese Wahl nehmen Ihnen die vier hier verglichenen
            Vermittlungsportale ab. Wie das im rechtlichen Detail aussieht, steht im{' '}
            <Link href="/kfz-gutachter/online-kfz-gutachten" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              Abschnitt zum LG-Bremen-Urteil zu Online-Gutachten
            </Link>.
          </p>
        </div>
      </section>

      {/* Direktvergleich — Tabelle */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Direktvergleich
            </p>
            <h2 className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Die 4 Plattformen auf einen Blick
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-claimondo-shield">
              Alle Wettbewerber-Angaben stammen von den jeweiligen Anbieter-Websites (Stand {STAND}).
              Die Claimondo-Netzgröße wird live aus unserer Datenbank gerendert.
            </p>
          </div>

          <div className="mt-10">
            <DataTableContainer className="shadow-glass-card">
              <Table className="min-w-[820px]">
                <caption className="px-4 py-3 text-left text-xs text-claimondo-ondo">
                  Kfz-Gutachter-Vermittlung im Vergleich — Claimondo, Neogutachter, Unfallpaten &amp;
                  Unfallgiganten (Stand {STAND})
                </caption>
                <Thead>
                  <Tr>
                    <Th scope="col" className="w-48">Kriterium</Th>
                    <Th scope="col" className="bg-claimondo-navy text-white">Claimondo</Th>
                    <Th scope="col">Neogutachter</Th>
                    <Th scope="col">Unfallpaten</Th>
                    <Th scope="col">Unfallgiganten</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {ROWS.map((row) => (
                    <Tr key={row.kriterium}>
                      <Th
                        scope="row"
                        className="bg-claimondo-bg text-left align-top font-semibold normal-case tracking-normal text-claimondo-navy"
                      >
                        {row.kriterium}
                      </Th>
                      <Td className="bg-claimondo-bg/60 align-top font-medium">{row.claimondo}</Td>
                      <Td className="align-top text-claimondo-shield">{row.neo}</Td>
                      <Td className="align-top text-claimondo-shield">{row.paten}</Td>
                      <Td className="align-top text-claimondo-shield">{row.giganten}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>

            {/* Modell-Framing (Aaron-Entscheidung 25.05.: Live-Zahl + Modell rahmen) */}
            <div className="mt-5 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
              <p className="text-sm leading-relaxed text-claimondo-shield">
                <strong className="text-claimondo-navy">Zur Einordnung der Netz-Zahlen:</strong> Die reinen
                Zahlen sind nur bedingt vergleichbar. Claimondo betreibt ein <strong>gemanagtes Netz</strong>,
                in dem jeder Fall aktiv von der Vor-Ort-Besichtigung über die Partnerkanzlei bis zur
                Auszahlung gesteuert wird. Unfallgiganten ist demgegenüber ein <strong>Verzeichnis</strong>,
                in dem Sachverständige kostenpflichtige Profil-Listings buchen — die Zahl 329 zählt
                Verzeichnis-Einträge, keine gemanagten Fälle.
              </p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-claimondo-shield/70">
              Stand der vergleichenden Angaben: {STAND}. Quelle: jeweilige Anbieter-Websites, abgerufen
              am {STAND} (Belege archiviert). Trustpilot-Werte sind zeitvariabel. Quellen:{' '}
              <a href="https://neogutachter.de" rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-claimondo-navy">neogutachter.de</a>,{' '}
              <a href="https://www.unfallpaten.de" rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-claimondo-navy">unfallpaten.de</a>,{' '}
              <a href="https://www.unfallgiganten.de" rel="nofollow noopener" target="_blank" className="underline underline-offset-2 hover:text-claimondo-navy">unfallgiganten.de</a>.
            </p>
          </div>
        </div>
      </section>

      {/* Wann welche Plattform passt */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Wann welche Plattform passt — Entscheidungshilfe
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            Es gibt nicht „die beste" Plattform, sondern die passende für Ihre Situation. Drei
            typische Fälle:
          </p>

          <div className="mt-8 space-y-6">
            <div className="rounded-ios-md border border-claimondo-border bg-white p-6">
              <h3 className="text-lg font-extrabold text-claimondo-navy">
                Sie brauchen maximale Geschwindigkeit (Termin heute oder morgen)
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-claimondo-shield">
                Alle vier werben mit „schnell vor Ort". Entscheidend ist in der Praxis die regionale
                Dichte verfügbarer Sachverständiger — prüfen Sie, wer in Ihrer Region tatsächlich
                kurzfristig besichtigen kann. Über die{' '}
                <Link href="/gutachter-finden" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
                  Karte unter „Gutachter finden"
                </Link>{' '}
                sehen Sie die verfügbaren Claimondo-Sachverständigen in Ihrer Nähe.
              </p>
            </div>

            <div className="rounded-ios-md border border-claimondo-border bg-white p-6">
              <h3 className="text-lg font-extrabold text-claimondo-navy">
                Sie wollen neben dem Gutachten auch anwaltliche Begleitung
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-claimondo-shield">
                Hier liegt Claimondo vorne: Die feste Partnerkanzlei ist in den Ablauf integriert und
                setzt Ihre Ansprüche direkt gegen die gegnerische Versicherung durch — Sie bleiben
                außen vor. Unfallpaten bietet als <strong>Unfallpaten-Alternative</strong> ebenfalls
                Rechtsbeistand „aus einer Hand", Neogutachter bindet Anwälte optional ein. So funktioniert
                der Claimondo-Ablauf im Detail unter{' '}
                <Link href="/wie-es-funktioniert" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
                  „So funktioniert die Claimondo-Abwicklung"
                </Link>.
              </p>
            </div>

            <div className="rounded-ios-md border border-claimondo-border bg-white p-6">
              <h3 className="text-lg font-extrabold text-claimondo-navy">
                Sie sind selbst Sachverständiger und wollen eine eigene Marke nutzen
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-claimondo-shield">
                Nur Claimondo bietet echtes <strong>Whitelabel-Branding</strong>: Sie treten gegenüber
                Ihren Kunden unter Ihrer eigenen Marke auf, während die Plattform die Abwicklung im
                Hintergrund trägt. Unfallgiganten verkauft demgegenüber kostenpflichtige Profil-Listings
                im Verzeichnis. Mehr dazu unter{' '}
                <Link href="/gutachter-partner" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
                  „Eigene Gutachter-Marke aufbauen"
                </Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Was alle vier gemeinsam haben */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Was alle vier gemeinsam haben — und was Sie immer selbst prüfen sollten
          </h2>
          <AnswerCapsule quelle="BGH VI ZR 67/06 · §249 BGB">
            Bei allen vier Plattformen ist die Vermittlung für unverschuldet Geschädigte{' '}
            <strong>kostenlos</strong>: Die Sachverständigen-Kosten sind eine Schadensposition, die
            die gegnerische Haftpflichtversicherung nach §249 BGB trägt (BGH VI ZR 67/06). Alle vier
            setzen außerdem auf physische Vor-Ort-Besichtigung und keine reinen Online-Gutachten.
          </AnswerCapsule>
          <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-claimondo-shield">
            <li className="flex gap-3">
              <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <span>
                <strong className="text-claimondo-navy">Kostenfrei für Sie:</strong> Ein
                kostenloser Kfz-Gutachter ist kein Werbeversprechen, sondern Rechtsfolge — sofern die
                Haftung der Gegenseite anerkannt ist.
              </span>
            </li>
            <li className="flex gap-3">
              <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <span>
                <strong className="text-claimondo-navy">Freies Wahlrecht (§249 BGB):</strong> Sie sind
                nicht an den Vorschlag der gegnerischen Versicherung gebunden.
              </span>
            </li>
            <li className="flex gap-3">
              <Minus className="mt-0.5 h-5 w-5 flex-shrink-0 text-claimondo-ondo" />
              <span>
                <strong className="text-claimondo-navy">Selbst prüfen:</strong> Tritt der
                Sachverständige unabhängig auf? Wird eine persönliche Besichtigung zugesagt? Gibt es
                eine nachvollziehbare Quelle für beworbene Netz-Zahlen?
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* LG-Bremen-Urteil */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Scale className="h-7 w-7 text-claimondo-ondo" />
            <h2 className="text-3xl font-extrabold text-claimondo-navy">
              Das LG-Bremen-Urteil 2026 und was es für Vermittlungsportale bedeutet
            </h2>
          </div>
          <p className="mt-6 text-[15px] leading-relaxed text-claimondo-shield">
            Am <strong>16.01.2026</strong> hat das Landgericht Bremen (Az. <strong>9 O 1720/24</strong>) auf
            Klage der Wettbewerbszentrale die Werbung eines Anbieters von „Online-Kfz-Gutachten" als
            irreführend untersagt. Das Urteil ist <strong>noch nicht rechtskräftig</strong>, setzt aber
            bereits jetzt einen klaren Maßstab für die gesamte Branche.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            <strong>Was das Urteil nicht verbietet:</strong> Die digitale Abwicklung eines Auftrags —
            Online-Meldung, Foto-Upload, digitale Kommunikation — bleibt zulässig, solange ein
            Sachverständiger das Fahrzeug anschließend <strong>persönlich vor Ort in Augenschein</strong>{' '}
            nimmt. Genau dieses hybride Modell nutzen alle vier hier verglichenen Plattformen.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            <strong>Was es verbietet:</strong> „Gutachten" allein auf Basis hochgeladener Fotos oder
            Klick-Antworten ohne persönliche Besichtigung — und die Werbung mit „kompletter Abwicklung
            gegenüber der Versicherung", wenn der Anbieter nicht im Rechtsdienstleistungs-Register
            eingetragen ist (RDG §§ 2, 3).
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link
              href="/kfz-gutachter/online-kfz-gutachten"
              className="inline-flex items-center gap-1 font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo"
            >
              Ausführliche Einordnung: Online-Kfz-Gutachten
              <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href="https://www.wettbewerbszentrale.de/lg-bremen-irrefuehrende-werbung-mit-online-kfz-gutachten/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy"
            >
              Quelle: Wettbewerbszentrale
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Häufige Fragen zum Vermittler-Vergleich
          </h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-white/60 bg-claimondo-bg p-5 shadow-glass-card transition-all hover:bg-white"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy">
                  <span className="flex items-center justify-between gap-3">
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

      {/* Fazit */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Fazit &amp; Empfehlung</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            Im Kfz-Gutachter-Vermittlung-Vergleich sind sich die vier Plattformen in den Grundlagen
            einig: kostenfrei für Geschädigte, freie Gutachterwahl, Vor-Ort-Besichtigung statt
            Online-only. Der Unterschied liegt in der Tiefe des Modells. Wer nur einen unabhängigen
            Sachverständigen sucht, ist bei Neogutachter oder Unfallgiganten richtig. Wer die komplette
            Regulierung inklusive anwaltlicher Durchsetzung aus einer Hand möchte, findet bei Claimondo
            und Unfallpaten das passendere Modell. Und Sachverständige, die unter eigener Marke arbeiten
            wollen, haben mit dem Whitelabel-Branding nur bei Claimondo diese Option.
          </p>
        </div>
      </section>

      {/* CTA */}
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
        <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2
            className="text-3xl font-bold sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Gutachter-Anfrage stellen — kostenfrei &amp; unverbindlich
          </h2>
          <p className="mt-4 text-white/70">
            Schaden online melden oder direkt anrufen — wir sind rund um die Uhr erreichbar.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <ChevronRight className="h-5 w-5 text-claimondo-ondo" />
              Gutachter-Anfrage stellen
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

      <ReviewerByline datum="2026-05-25" />

      <LandingFooter />
      <StickyCallBar quelle="Vermittlungsportale-Vergleich" />
    </div>
  )
}
