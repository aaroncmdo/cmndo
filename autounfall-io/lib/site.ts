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

  // Telefon: die zentrale Claimondo-Mobilnummer (Entscheidung Aaron 23.08.2026).
  //
  // HEBT DIE ENTSCHEIDUNG VOM 14.06.2026 AUF ("au.io-eigene Mobilnr, um den
  // Claimondo-Footprint zu vermeiden"). Grund: es soll ueberall EINE Nummer
  // hinterlegt sein. Die vorherige '0171 20289514' war die einzige Stelle im
  // gesamten System, an der sie vorkam — sie tauchte in 325 Nachrichten kein
  // einziges Mal auf, waehrend '0176 20289514' (dieselben acht Endziffern)
  // 20 Nachrichten traegt. Wer hier wieder eine au.io-eigene Nummer setzen
  // will, klaert das vorher ab, statt den Wert stillschweigend zu tauschen.
  //
  // ⚠ `??` faengt KEINEN Leerstring: ein auf dem VPS gesetztes, aber leeres
  // NEXT_PUBLIC_SITE_PHONE ergaebe eine leere Telefonzeile im Impressum.
  // Aktuell ist die Variable nicht gesetzt, der Default hier greift.
  phone: process.env.NEXT_PUBLIC_SITE_PHONE ?? '0151 5360 8515',
  // Kontakt-Mail team@autounfall.io (LexDrive-Freigabe 12.06.2026). Postfach muss
  // operativ vor Go-Live aktiv sein. Override via NEXT_PUBLIC_SITE_EMAIL.
  contactEmail: process.env.NEXT_PUBLIC_SITE_EMAIL ?? 'team@autounfall.io',
} as const

export type SiteConfig = typeof SITE

/**
 * Standard-Vorschaubild fuer `openGraph.images` / `twitter.images`.
 *
 * Muss von JEDER Stelle mitgegeben werden, die einen eigenen `openGraph`- oder
 * `twitter`-Block setzt: Next merged `metadata` nur FLACH — ein eigener Block
 * ersetzt den des Layouts komplett, inklusive `images`. Auf prod gemessen
 * (18.08.): Startseite hatte ein Bild, /nutzungsausfall, /schmerzensgeld,
 * /wer-hat-schuld und /verbringungskosten keins.
 */
export const OG_IMAGE = {
  url: '/og-image.jpg',
  width: 1200,
  height: 630,
  alt: SITE.name,
}
