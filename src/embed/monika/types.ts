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
}

export type MonikaState = 'idle' | 'qualify' | 'day' | 'time' | 'form' | 'success' | 'fallback'
export type DaySlot = 'asap' | 'morgen' | 'uebermorgen'
export type TimeSlot = 'vormittag' | 'nachmittag' | 'abend'

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
  source: WidgetSource
  cluster?: string
  stadt_slug?: string
  embed_site_slug?: string
  page_url?: string
  consent_ts?: string
  site_token?: string
  honeypot?: string
}
