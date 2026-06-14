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
  /** „Stand:"-Datum aller Ratgeber-/Artikel-Seiten (Header-Meta-Zeile in
   *  components/article/parts.tsx + Seiten-Disclaimer). EINE Quelle, damit Eyebrow
   *  und Disclaimer nie auseinanderlaufen (Legal-Defekt 14.06.: parts.tsx zeigte
   *  „Mai 2026", Disclaimer „Juni 2026"). Generierte Daten-Vintage-Zitate
   *  („AKB Stand Mai 2026") sind bewusst NICHT betroffen — andere Semantik. */
  contentStand: 'Juni 2026',
  /** Analytics: Plausible (cookielos, immer aktiv) + Microsoft Clarity (Opt-out,
   *  Art. 6 Abs. 1 lit. f). KEIN GA4/Google-Ads. */
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? 'autounfall.io',
  /** Clarity-Projekt-ID (public, kein Secret). Override via Env; oeffentliche ID
   *  als Default, damit Clarity im Opt-out-Modell ohne Extra-Config laedt. */
  clarityProjectId: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? 'x5ty9kh510',

  /** Betreiber / publisher / author-Affiliation — ausschliesslich diese Entitaet. */
  publisher: {
    name: 'Kitta & Sprafke UG (haftungsbeschränkt)',
    shortName: 'Kitta & Sprafke UG',
    street: 'Hansaring 10',
    postalCode: '50670',
    city: 'Köln',
    country: 'Deutschland',
    managingDirectors: 'Aaron Sprafke, Nicolas Kitta',
    /** Verifizierte, geclaimte Unternehmensprofile (Organization sameAs). Nur real
     *  existierende Profile — kein X/YouTube (nicht angelegt), kein claimondo.de. */
    sameAs: [
      'https://www.linkedin.com/company/autounfall-io',
      'https://www.crunchbase.com/organization/autounfall-io',
      'https://www.startbase.de/organization/autounfall-io',
    ],
  },

  /** Verkehrsrechts-Partnerkanzlei — bewusst UNBENANNT (Cowork 2026-06-12,
   *  ueberschreibt „LexDrive bleibt benannt"). Singular, real = 1 Kanzlei. */
  legalReviewer: {
    name: 'Verkehrsrechts-Partnerkanzlei',
  },

  // Telefon 0221 25906530 bleibt (Entscheidung Aaron/LexDrive 12.06.2026).
  phone: process.env.NEXT_PUBLIC_SITE_PHONE ?? '0221 25906530',
  // Kontakt-Mail team@autounfall.io (LexDrive-Freigabe 12.06.2026). Postfach muss
  // operativ vor Go-Live aktiv sein. Override via NEXT_PUBLIC_SITE_EMAIL.
  contactEmail: process.env.NEXT_PUBLIC_SITE_EMAIL ?? 'team@autounfall.io',
} as const

export type SiteConfig = typeof SITE
