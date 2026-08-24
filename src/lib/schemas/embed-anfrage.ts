// AAR-939 · Monika-Embed · Stream 2 — Zod-Schema fuer den Embed-Anfrage-Webhook.
//
// Konvention wie src/lib/schemas/manual-lead.ts: Schema enforced DATEN-FORM
// (Typen + Max-Length), nicht Business-Pflicht. name+telefon sind aber echte
// Pflichtfelder (das Widget sendet sie immer). honeypot MUSS leer sein.

import { z } from 'zod'

// 'mcp': externer LLM-Chat (ChatGPT/Claude via MCP-Write-Tool claimondo_melde_schaden).
// Geht NICHT durch den /api/anfrage-from-lp-Webhook (kein Browser-Origin), sondern ueber
// den server-to-server /api/v1/melde-schaden-Endpoint — additiver Enum-Wert fuer Attribution
// (lead.source_channel='mcp') + die insertAnfrage-TypprUfung.
export const EMBED_SOURCES = ['kfz_gutachter_lp', 'sv_embed', 'generic_lp', 'mcp'] as const

const PHONE_RE = /^\+?[0-9\s\-/()]{8,20}$/

export const EmbedAnfrageSchema = z.object({
  name: z.string().trim().min(2).max(80),
  telefon: z.string().trim().regex(PHONE_RE),
  email: z.string().max(120).optional(),

  // Slot-Auswahl aus dem Widget
  slot: z.string().max(40).optional(),
  slot_text: z.string().max(120).optional(),
  time_slot: z.string().max(40).optional(),
  schadentyp: z.string().max(80).optional(),
  schadens_kurzbeschreibung: z.string().max(1000).optional(),

  // AAR-956 P3: 2-Knopf-Funnel. 'direkt' = sofort in /flow (Token-Redirect, kein
  // Versand); 'senden' = FlowLink versenden + Dispatcher kontaktiert manuell.
  // Fehlt = Legacy-Pfad (funnel_modus/callback) unveraendert.
  aktion: z.enum(['senden', 'direkt']).optional(),

  // AAR-956 P5 (gutachter-finder-Intake): per-Request-Fixer-SV (Karten-Klick) +
  // geocodeter Besichtigungsort. Das Embed leitet den SV sonst per-Site ab; der
  // gutachter-finder pickt ihn pro Anfrage. Optional → andere Quellen unberuehrt.
  zugeordneter_sv_id: z.string().uuid().optional(),
  besichtigungsort_lat: z.number().optional(),
  besichtigungsort_lng: z.number().optional(),
  besichtigungsort_adresse: z.string().max(300).optional(),

  // Monika-A-Flow-Diskriminatoren (DB-CHECK ist das echte Gate; hier nur Daten-Form)
  anliegen: z.string().max(40).optional(),
  unfalltyp: z.string().max(40).optional(),
  schuld_einschaetzung: z.string().max(40).optional(),
  bewertungsgrund: z.string().max(40).optional(),
  wunsch_tag: z.string().max(40).optional(),
  wunsch_zeit: z.string().max(40).optional(),

  // Quelle
  source: z.enum(EMBED_SOURCES),
  cluster: z.string().max(80).optional(),
  stadt_slug: z.string().max(120).optional(),
  embed_site_slug: z.string().max(120).optional(),
  page_url: z.string().max(500).optional(),

  // Gewinnspiel: die vom Teilnehmer im Formular gewaehlte Praemie. Landet NICHT
  // in gutachter_finder_anfragen (dort gibt es keine Spalte dafuer und
  // buildAnfrageColumns mappt explizit), sondern in gewinnspiel_teilnahmen.
  // Die ID wird serverseitig gegen die Praemien der aktiven Kampagne geprueft.
  gewinnspiel_praemie_id: z.string().uuid().optional(),

  // Attribution
  gclid: z.string().max(300).optional(),
  utm_source: z.string().max(150).optional(),
  utm_medium: z.string().max(150).optional(),
  utm_campaign: z.string().max(150).optional(),
  utm_term: z.string().max(150).optional(),
  utm_content: z.string().max(150).optional(),
  ga_client_id: z.string().max(120).optional(),
  consent_ts: z.string().max(40).optional(),

  // Security
  site_token: z.string().max(2000).optional(), // HS256-Site-Token, im Webhook via verifySiteToken geprueft (sv_embed)
  honeypot: z.string().max(0).optional(), // Bot-Falle: muss leer sein
})

export type EmbedAnfrageInput = z.infer<typeof EmbedAnfrageSchema>
