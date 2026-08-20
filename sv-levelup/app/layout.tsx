import type { Metadata } from 'next'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}
