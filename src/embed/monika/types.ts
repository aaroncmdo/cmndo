// AAR-939 · Monika-Embed · Stream 4 — Widget-Typen (framework-neutral)
//
// Self-contained Preact-Widget, per esbuild als IIFE nach public/embed/monika.js
// gebaut. KEINE @/-Imports — laeuft cross-origin auf fremden Domains, isoliert.

export type WidgetSource = 'kfz_gutachter_lp' | 'sv_embed'

export interface MonikaTheme {
  primary: string
  accent: string
  text: string
  logoUrl: string
  /** true = Variante A (free) → "powered by Claimondo"-Strip prominent im Bubble. */
  brandedByClaimondo: boolean
}

export interface MonikaTracking {
  ga4MeasurementId: string | null
  gadsConversionId: string | null
  gadsConversionLabel: string | null
}

export interface MonikaConfig {
  source: WidgetSource
  base: string // claimondo.de Origin fuer API-Calls
  theme: MonikaTheme
  telefon: string | null
  whatsapp: string | null // digits-only fuer wa.me
  embedSiteSlug: string | null
  siteToken: string | null
  cluster: string | null
  stadtSlug: string | null
  /** Per-SV Tracking-IDs (nur sv_embed, aus /api/embed/config). null = kein Tracking. */
  tracking: MonikaTracking | null
  /** Claimondo-Branding (Siegel-FAB + Monika-Foto): cluster-LP immer true, sv_embed = variante-A. */
  isClaimondoBranded: boolean
}

export interface Attribution {
  gclid?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  ga_client_id?: string
}

/** Payload an /api/anfrage-from-lp (deckt EmbedAnfrageSchema aus Stream 2). */
export interface AnfragePayload extends Attribution {
  name: string
  telefon: string
  slot?: string
  slot_text?: string
  time_slot?: string
  // Monika-A-Flow-Diskriminatoren
  anliegen?: string
  unfalltyp?: string
  schuld_einschaetzung?: string
  bewertungsgrund?: string
  wunsch_tag?: string
  wunsch_zeit?: string
  source: WidgetSource
  cluster?: string
  stadt_slug?: string
  embed_site_slug?: string
  page_url?: string
  consent_ts?: string
  site_token?: string
  honeypot?: string
}
