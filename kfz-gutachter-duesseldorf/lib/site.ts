// Zentrale Site-Konfiguration · Kfz-Gutachter Düsseldorf (Cluster-Master).
// Betreiber/Impressum/Datenschutz laufen ueber claimondo.de (Footer-Links),
// Ratgeber-Deep-Links auf autounfall.io. KEIN eigenes Supabase/Backend
// (Anfragen-Capture = Plan 2 / Monika-Embed).

export const SITE = {
  name: 'Kfz-Gutachter Düsseldorf',
  shortName: 'Kfz-Gutachter Düsseldorf',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kfz-unfallgutachter-duesseldorf.de',
  locale: 'de_DE',
  lang: 'de',

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
