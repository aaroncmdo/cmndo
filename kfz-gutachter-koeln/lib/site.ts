// Zentrale Site-Konfiguration · Kfz-Gutachter Köln (Cluster-Vorlage für Nicolas).
// Betreiber/Impressum/Datenschutz laufen ueber claimondo.de (Footer-Links),
// Ratgeber-Deep-Links auf autounfall.io. KEIN eigenes Supabase/Backend
// (Anfragen-Capture = Plan 2 / Monika-Embed).

export const SITE = {
  name: 'Kfz-Gutachter Köln',
  shortName: 'Kfz-Gutachter Köln',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kfz-unfallgutachter-koeln.de',
  locale: 'de_DE',
  lang: 'de',

  /**
   * Stand der Cluster-Inhalte (ISO) — speist `dateModified` im FAQPage-Schema.
   *
   * WARUM: Ohne das Feld trug keine Seite dieser Property ein Aktualitaets-Signal;
   * fuer KI-Antwortmaschinen ist Aktualitaet ein dokumentierter Zitations-Faktor
   * (GEO-Baseline 18.08.2026, Befund B2 — auf claimondo.de und autounfall.io bereits
   * behoben). Die Seiten sind template-generiert und haben kein individuelles Datum,
   * deshalb eine gepflegte Konstante fuer Vorlage + Stadtdaten gemeinsam.
   * Startwert = git-Datum der Property-Inhalte, nachweisbar statt geschaetzt.
   *
   * ⚠ PFLEGE: bei inhaltlichen Aenderungen bumpen. Bewusst KEIN new Date() —
   * ein Datum, das ohne Aenderung mitwandert, entwertet das Signal.
   */
  contentLastUpdated: '2026-08-18',

  /** Betreiber-Block (Footer-Impressum-Kurzform). */
  operator: {
    name: 'Kitta & Sprafke UG (haftungsbeschränkt)',
    shortName: 'Kitta & Sprafke UG',
    street: 'Hansaring 10',
    postalCode: '50670',
    city: 'Köln',
    country: 'DE',
  },

  /** Impressum + Datenschutz liegen auf claimondo.de (keine eigenen Rechtspages). */
  legalUrl: 'https://claimondo.de',
  /** Ratgeber-Deep-Links (Content-Hub). */
  ratgeberBase: 'https://autounfall.io',

  /** Monika-Embed (Plan 2 / Phase 2). */
  embedBase: process.env.NEXT_PUBLIC_EMBED_BASE ?? 'https://claimondo.de',
  monikaEnabled: process.env.NEXT_PUBLIC_MONIKA_EMBED_ENABLED === 'true',

  /** Tracking (Stubs — befuellt bei Live-Schaltung). */
  gtmId: process.env.NEXT_PUBLIC_GTM_ID || '',
  gadsAwId: process.env.NEXT_PUBLIC_GADS_AW_ID || '',
  gadsConvCall: process.env.NEXT_PUBLIC_GADS_CONV_CALL || '',
  gadsConvWa: process.env.NEXT_PUBLIC_GADS_CONV_WA || '',
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || '',
  clarityId: process.env.NEXT_PUBLIC_CLARITY_ID || '',
} as const

export type SiteConfig = typeof SITE
