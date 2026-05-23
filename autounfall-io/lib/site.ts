// Zentrale Site-Konfiguration · autounfall.io (Property 2, STANDALONE).
// KEIN Claimondo-Bezug (kein Name/Logo/Telefon/Link). publisher/author =
// ausschliesslich Kitta & Sprafke UG. Siehe ENTITY-MODELL-LOCK v2.

export const SITE = {
  name: 'autounfall.io',
  /** Service-Branding (STANDALONE) — kein Claimondo. */
  tagline: 'Unfall-Assistance',
  description:
    'Unabhängige Unfall-Assistance: Ratgeber, Decoder und Rechner rund um den Kfz-Unfallschaden — verständlich erklärt.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://autounfall.io',
  locale: 'de_DE',
  lang: 'de',
  /** Cookieloses Analytics. KEIN GA4/Google-Ads/Clarity. */
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? 'autounfall.io',

  /** Betreiber / publisher / author-Affiliation — ausschliesslich diese Entitaet. */
  publisher: {
    name: 'Kitta & Sprafke UG (haftungsbeschränkt)',
    shortName: 'Kitta & Sprafke UG',
    street: 'Hansaring 10',
    postalCode: '50670',
    city: 'Köln',
    country: 'Deutschland',
    managingDirectors: 'Aaron Sprafke, Nicolas Kitta',
  },

  /** Partnerkanzlei — Aaron-Entscheidung: LexDrive bleibt benannt (#legal-reviewer). */
  legalReviewer: {
    name: 'LexDrive UG',
    url: 'https://lex-drive.com',
  },

  // TODO(Aaron): eigene autounfall.io-Telefonnummer nachliefern. `0221 25906530`
  // ist eine kfzgutachter-Nummer (Footprint) → bis dahin KEINE Nummer hart
  // eintragen. Default null = Platzhalter (nichts rendern).
  phone: process.env.NEXT_PUBLIC_SITE_PHONE ?? null,
  // TODO(Aaron): eigene autounfall.io-Kontakt-Mail. `aaron.sprafke@claimondo.de`
  // ist ein claimondo.de-Footprint (verlinkt au.io <-> Claimondo oeffentlich) →
  // bis dahin null = Platzhalter. Vor Go-Live setzen (NEXT_PUBLIC_SITE_EMAIL).
  contactEmail: process.env.NEXT_PUBLIC_SITE_EMAIL ?? null,
} as const

export type SiteConfig = typeof SITE
