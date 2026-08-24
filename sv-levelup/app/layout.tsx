import type { Metadata } from 'next'
import './globals.css'
import { ProSealWidget } from './ProSealWidget'

const BASIS = 'https://sv-levelup.claimondo.de'

/**
 * ⚠ Next merged `metadata` NICHT tief. Wer in einer Unterseite ein eigenes
 * `openGraph` oder `alternates` exportiert, ERSETZT den Wert von hier
 * vollstaendig — er ergaenzt ihn nicht. Im Projekt hat genau das an einem Tag
 * drei Prod-Defekte erzeugt. Unterseiten setzen deshalb nur `title`,
 * `description` und `robots`; alles andere bleibt hier.
 */
export const metadata: Metadata = {
  metadataBase: new URL(BASIS),
  // 55 Zeichen. Der Titel ist in der Trefferliste zugleich die Ueberschrift —
  // ueber etwa 60 schneidet Google ihn ab.
  title: 'Sichtbarkeits-Check für Kfz-Sachverständige | SV-LevelUp',
  description:
    'Kostenloser Sichtbarkeits-Check für Kfz-Sachverständige: Wo stehen Sie im Umkreis? '
    + 'Google-Profil, Website, Wettbewerb und Nachfrage — jede Zahl mit Quelle und Datum.',
  keywords: [
    'Kfz-Sachverständiger', 'Kfz-Gutachter', 'Sichtbarkeit', 'Google-Unternehmensprofil',
    'Sachverständigenbüro', 'lokale Auffindbarkeit',
  ],
  alternates: { canonical: BASIS },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    url: BASIS,
    siteName: 'SV-LevelUp',
    title: 'Sichtbarkeits-Check für Kfz-Sachverständige',
    description:
      'Wo stehen Sie im Umkreis? Google-Profil, Website, Wettbewerb und Nachfrage — '
      + 'jede Zahl mit Quelle und Datum.',
  },
  twitter: {
    card: 'summary',
    title: 'Sichtbarkeits-Check für Kfz-Sachverständige',
    description: 'Wo stehen Sie im Umkreis? Jede Zahl mit Quelle und Datum.',
  },
  robots: { index: true, follow: true },
}

/**
 * Strukturierte Daten.
 *
 * Genau das, was das Modul `seo` von den geprueften Websites verlangt — es
 * waere schwer erklaerbar, es auf der eigenen Seite wegzulassen.
 */
const STRUKTURDATEN = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'SV-LevelUp',
  url: BASIS,
  applicationCategory: 'BusinessApplication',
  inLanguage: 'de-DE',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  description:
    'Sichtbarkeits-Check für Kfz-Sachverständige: misst Google-Unternehmensprofil, Website, '
    + 'Wettbewerbsumfeld und Nachfrage im eigenen Gebiet.',
  provider: {
    '@type': 'Organization',
    name: 'Claimondo',
    url: 'https://claimondo.de',
  },
  audience: {
    '@type': 'Audience',
    audienceType: 'Kfz-Sachverständige und Sachverständigenbüros',
  },
}

/**
 * Pflichtangaben-Fuss.
 *
 * ⚠ WARUM ER IM LAYOUT STEHT und nicht in den einzelnen Seiten: § 5 DDG
 * verlangt, dass das Impressum „leicht erkennbar, unmittelbar erreichbar und
 * STAENDIG VERFUEGBAR" ist. Ein Link nur auf der Startseite erfuellt das nicht —
 * ein Check-Ergebnis wird per Token-Link geteilt und ist oft die erste Seite,
 * die jemand von uns sieht.
 *
 * ⚠ BEFUND 24.08.2026: Diese Seite hatte WEDER Impressum NOCH Datenschutz-
 * Verweis — und das ausgerechnet auf einem Auftritt, dessen Modul `web` bei
 * fremden Sachverstaendigen genau diese beiden Angaben prueft und dessen
 * Gespraechsleitfaden vor der Abmahnkanzlei warnt.
 *
 * ENTSCHEIDUNG Aaron 24.08.2026: Der Verweis auf das Claimondo-Impressum
 * GENUEGT — kein eigenes Impressum fuer diese Subdomain. Betreiber und
 * Anbieterkennzeichnung sind identisch; sv-levelup.claimondo.de ist keine
 * eigene Rechtsperson. Bitte nicht erneut aufrollen.
 *
 * Abschnitt 9.6 der Datenschutzerklaerung deckt das ProvenExpert-Siegel ab, das
 * auf dieser Seite die Besucher-IP an einen Dritten uebermittelt.
 *
 * ⚠ DAVON UNBERUEHRT: Die Datenschutzerklaerung ist etwas anderes als das
 * Impressum — sie muss beschreiben, WAS hier verarbeitet wird (Pruefauftraege,
 * Ergebnisse, Token-Links, gespeicherte Standortangaben). Deckt der Text auf
 * claimondo.de das nicht ab, ist der Verweis formal richtig und inhaltlich
 * unvollstaendig. Nicht geprueft.
 */
function RechtsFuss() {
  return (
    <footer className="abschnitt">
      <div className="huelle">
        <p className="text-sm text-muted">
          <a href="https://claimondo.de/impressum" className="underline hover:no-underline">
            Impressum
          </a>
          {' · '}
          <a href="https://claimondo.de/datenschutz" className="underline hover:no-underline">
            Datenschutz
          </a>
          {' · '}
          <span>Ein Angebot der Claimondo GmbH i. Gr.</span>
        </p>
      </div>
    </footer>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <script
          type="application/ld+json"
          // Der Block ist ein fester, selbst erzeugter Wert — keine Nutzereingabe.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUKTURDATEN) }}
        />
      </head>
      <body>
        {children}
        <RechtsFuss />
        <ProSealWidget />
      </body>
    </html>
  )
}
