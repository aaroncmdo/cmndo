// AAR-939 · Monika-Embed · PURE Spalten-Mapping.
//
// Bewusst OHNE server-only / DB / WhatsApp / Email-Imports → im vitest-node-Env
// isoliert testbar (anfrage.ts traegt den server-only-Graph und re-exportiert von hier).
// Importiert nur den Zod-Inferenz-Typ (das Schema-Modul zieht nur zod).

import type { EmbedAnfrageInput } from '@/lib/schemas/embed-anfrage'

export type AnfrageVariante = 'A' | 'B'

export interface InsertAnfrageInput {
  payload: EmbedAnfrageInput
  variante: AnfrageVariante | null // null bei Cluster-LP (kein A/B)
  embedSiteId: string | null
  originDomain: string | null
}

/** Host aus einem Origin-/Referer-Header oder einer URL extrahieren. Lebt hier
 *  (PURE) statt in anfrage.ts, damit leichte Consumer wie /api/embed/config ihn
 *  ohne den server-only-WA/Email-Graph importieren koennen. */
export function extractHost(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    // Origin-Header ist manchmal nur der Host ohne Schema
    const bare = value.trim().toLowerCase().replace(/^www\./, '')
    return /^[a-z0-9.-]+$/.test(bare) ? bare : null
  }
}

/** Splittet einen Voll-Namen in vorname/nachname (gfa hat kein name-Feld). */
export function splitName(full: string): { vorname: string; nachname: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { vorname: parts[0], nachname: '' }
  return { vorname: parts[0], nachname: parts.slice(1).join(' ') }
}

const WUNSCH_TAG_LABEL: Record<string, string> = {
  morgen: 'Morgen',
  uebermorgen: 'Übermorgen',
  asap: 'So schnell wie möglich',
}
const WUNSCH_ZEIT_LABEL: Record<string, string> = {
  vormittag: 'Vormittag',
  nachmittag: 'Nachmittag',
  abend: 'Abend',
}

/**
 * PURE: baut die gfa-Spalten-Map aus einer Embed-Anfrage. NOT-NULL-Spalten
 * (vorname/nachname/email/schadentyp) nie null. Status: A -> embed_free,
 * sonst (B / Cluster-LP) -> neu. wunschtermin_wann wird aus tag+zeit (Monika-A)
 * menschenlesbar komponiert, Fallback slot_text/slot.
 */
export function buildAnfrageColumns(input: InsertAnfrageInput): Record<string, unknown> {
  const { payload, variante, embedSiteId, originDomain } = input
  const { vorname, nachname } = splitName(payload.name)
  const status = variante === 'A' ? 'embed_free' : 'neu'

  const wunschComposed = [
    payload.wunsch_tag ? (WUNSCH_TAG_LABEL[payload.wunsch_tag] ?? payload.wunsch_tag) : '',
    payload.wunsch_zeit ? (WUNSCH_ZEIT_LABEL[payload.wunsch_zeit] ?? payload.wunsch_zeit) : '',
  ]
    .filter(Boolean)
    .join(', ')
  const wunschterminWann =
    wunschComposed || payload.slot_text || ([payload.slot, payload.time_slot].filter(Boolean).join(' ') || null)

  return {
    // NOT-NULL-Spalten: nie null (saveStep.ts-Pattern)
    vorname,
    nachname,
    email: payload.email ?? '',
    schadentyp: payload.schadentyp ?? 'unbekannt',
    telefon: payload.telefon,
    schadens_kurzbeschreibung: payload.schadens_kurzbeschreibung ?? null,
    wunschtermin_wann: wunschterminWann,
    bevorzugter_kanal: 'whatsapp',
    status,
    // Diskriminatoren
    source: payload.source,
    variante: variante ?? null,
    embed_site_id: embedSiteId,
    cluster: payload.cluster ?? null,
    stadt_slug: payload.stadt_slug ?? null,
    page_url: payload.page_url ?? null,
    origin_domain: originDomain,
    // Monika-A-Flow
    anliegen: payload.anliegen ?? null,
    unfalltyp: payload.unfalltyp ?? null,
    schuld_einschaetzung: payload.schuld_einschaetzung ?? null,
    bewertungsgrund: payload.bewertungsgrund ?? null,
    wunsch_tag: payload.wunsch_tag ?? null,
    wunsch_zeit: payload.wunsch_zeit ?? null,
    // Attribution
    gclid: payload.gclid ?? null,
    utm_source: payload.utm_source ?? null,
    utm_medium: payload.utm_medium ?? null,
    utm_campaign: payload.utm_campaign ?? null,
    utm_term: payload.utm_term ?? null,
    utm_content: payload.utm_content ?? null,
    ga_client_id: payload.ga_client_id ?? null,
    dsgvo_zustimmung_am: payload.consent_ts ?? new Date().toISOString(),
    // AAR-956 P5 (gutachter-finder): per-Request-Fixer + geocodeter Besichtigungsort.
    // schadenort_lat/lng sind die einzigen Koord-Spalten der gfa (issueCanonical
    // mappt sie -> lead.fahrzeug_standort_lat/lng fuers /flow-Matching, wie der alte
    // starteLiveBuchung-Pfad). zugeordneter_sv_id wird in /flow zum Fixer. Andere
    // Quellen senden diese Felder nicht -> null (Verhalten unveraendert).
    zugeordneter_sv_id: payload.zugeordneter_sv_id ?? null,
    schadenort_lat: payload.besichtigungsort_lat ?? null,
    schadenort_lng: payload.besichtigungsort_lng ?? null,
    besichtigungsort_adresse: payload.besichtigungsort_adresse ?? null,
    matching_typ: payload.zugeordneter_sv_id ? 'karte-klick-live' : null,
  }
}
