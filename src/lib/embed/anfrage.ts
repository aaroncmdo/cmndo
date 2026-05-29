import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNachricht } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/email/google/client'
import type { EmbedAnfrageInput } from '@/lib/schemas/embed-anfrage'

/**
 * AAR-939 · Monika-Embed · Stream 2 — Anfrage-Verarbeitung (Shared)
 *
 * Single Source of Truth fuer den Empfang von Monika-Embed-Anfragen.
 * Cluster-LPs (source='kfz_gutachter_lp') UND SV-Embeds (source='sv_embed')
 * POSTen an /api/anfrage-from-lp, das diese Helper nutzt.
 *
 * Scope (Aaron 29.05.2026): Anfrage -> Lead -> Termin. KEIN Claim/Fall/Auftrag.
 * REUSE der bestehenden gutachter_finder_anfragen (kein neues anfragen-Table).
 * Writes laufen ausschliesslich via service_role (createAdminClient) — die
 * anon-INSERT-Policy ist auf source IS NULL gescoped (Native-Funnel), Monika-
 * Zeilen (source NOT NULL) sind anon nicht insertierbar/-lesbar (Migration
 * 20260529154434).
 */

export type AnfrageVariante = 'A' | 'B'

export interface EmbedSiteConfig {
  id: string
  slug: string
  variante: AnfrageVariante
  einzelpreis_eur: number
  empfaenger_email: string
  cc_email: string | null
  baileys_routing_nummer: string
  erlaubte_domains: string[]
  max_anfragen_pro_h: number
  aktiv: boolean
}

// ── Helfer ─────────────────────────────────────────────────────────────────

/** Splittet einen Voll-Namen in vorname/nachname (gfa hat kein name-Feld). */
export function splitName(full: string): { vorname: string; nachname: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { vorname: parts[0], nachname: '' }
  return { vorname: parts[0], nachname: parts.slice(1).join(' ') }
}

/** Host aus einem Origin-/Referer-Header oder einer URL extrahieren. */
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

/** Cluster-LP-Domains, gegen die kfz_gutachter_lp-Anfragen validiert werden. */
export function clusterAllowlist(): string[] {
  const env = process.env.MONIKA_CLUSTER_DOMAINS
  if (env) return env.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
  // Fallback: die drei Cluster-LP-Domains (no-hyphen Variante, siehe Cluster-LP-Memory)
  return [
    'kfz-unfallgutachter-wuppertal.de',
    'kfz-unfallgutachter-duesseldorf.de',
    'kfz-unfallgutachter-bonn.de',
  ]
}

// ── Embed-Site laden ─────────────────────────────────────────────────────────

/** Laedt die aktive Embed-Site-Konfig per slug (service_role). */
export async function ladeEmbedSite(slug: string): Promise<EmbedSiteConfig | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('embed_sites')
    .select('id, slug, variante, einzelpreis_eur, empfaenger_email, cc_email, baileys_routing_nummer, erlaubte_domains, max_anfragen_pro_h, aktiv')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as EmbedSiteConfig
}

// ── Insert ───────────────────────────────────────────────────────────────────

export interface InsertAnfrageInput {
  payload: EmbedAnfrageInput
  variante: AnfrageVariante | null // null bei Cluster-LP (kein A/B)
  embedSiteId: string | null
  originDomain: string | null
}

export type InsertAnfrageResult =
  | { ok: true; anfrageId: string; status: string }
  | { ok: false; error: string }

/**
 * Schreibt eine Monika-Anfrage in gutachter_finder_anfragen (service_role).
 * Status-Konvention:
 *   variante 'A' (free)               -> 'embed_free' (NICHT in Dispatch-Queue)
 *   variante 'B' (paid) + Cluster-LP  -> 'neu'        (Dispatch)
 *
 * ACHTUNG (Live-Schema): vorname/nachname/email/schadentyp sind NOT NULL —
 * leere Strings / Platzhalter wie im Native-Funnel (saveStep.ts), nie null.
 */
export async function insertAnfrage(input: InsertAnfrageInput): Promise<InsertAnfrageResult> {
  const { payload, variante, embedSiteId, originDomain } = input
  const db = createAdminClient()

  const { vorname, nachname } = splitName(payload.name)
  const status = variante === 'A' ? 'embed_free' : 'neu'

  // wunschtermin_wann: menschenlesbarer Slot-String fuer den Dispatcher
  const wunschterminWann =
    payload.slot_text ??
    ([payload.slot, payload.time_slot].filter(Boolean).join(' ') || null)

  const columns: Record<string, unknown> = {
    // NOT-NULL-Spalten: nie null (siehe saveStep.ts-Pattern)
    vorname,
    nachname,
    email: payload.email ?? '',
    schadentyp: payload.schadentyp ?? 'unbekannt',
    telefon: payload.telefon,
    schadens_kurzbeschreibung: payload.schadens_kurzbeschreibung ?? null,
    wunschtermin_wann: wunschterminWann,
    bevorzugter_kanal: 'whatsapp',
    status,
    // Monika-Diskriminatoren
    source: payload.source,
    variante: variante ?? null,
    embed_site_id: embedSiteId,
    cluster: payload.cluster ?? null,
    stadt_slug: payload.stadt_slug ?? null,
    page_url: payload.page_url ?? null,
    origin_domain: originDomain,
    // Attribution
    gclid: payload.gclid ?? null,
    utm_source: payload.utm_source ?? null,
    utm_medium: payload.utm_medium ?? null,
    utm_campaign: payload.utm_campaign ?? null,
    utm_term: payload.utm_term ?? null,
    utm_content: payload.utm_content ?? null,
    ga_client_id: payload.ga_client_id ?? null,
    // Consent: consent_ts vom Widget -> dsgvo_zustimmung_am
    dsgvo_zustimmung_am: payload.consent_ts ?? new Date().toISOString(),
  }

  const { data, error } = await db
    .from('gutachter_finder_anfragen')
    .insert(columns)
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }
  }
  return { ok: true, anfrageId: data.id as string, status }
}

// ── Benachrichtigung ─────────────────────────────────────────────────────────

export interface NotifyAnfrageInput {
  anfrageId: string
  payload: EmbedAnfrageInput
  variante: AnfrageVariante | null
  site: EmbedSiteConfig | null
}

const DISPATCH_EMAIL = 'info@claimondo.de'

/**
 * Benachrichtigt je nach Quelle/Variante (best-effort, wirft nie):
 *   • Variante A (free)      -> nur WhatsApp an den SV (baileys_routing_nummer)
 *   • Variante B (paid)      -> Email an Dispatch (info@) — Dispatch qualifiziert
 *   • Cluster-LP             -> Email an Dispatch (info@) + WhatsApp an KFZ_LP_BAILEYS_TARGET
 *
 * Reuse: sendNachricht (entity 'gfa', WA + Audit-Log, public-funnel-tauglich)
 * + sendEmail (zentraler Sender). Beide in try/catch — ein Send-Fail darf den
 * bereits geschriebenen DB-Insert nicht nachtraeglich als Fehler erscheinen lassen.
 */
export async function notifyAnfrage(input: NotifyAnfrageInput): Promise<void> {
  const { anfrageId, payload, variante, site } = input
  const kunde = payload.name
  const stadt = payload.stadt_slug ?? payload.cluster ?? '—'
  const slot = payload.slot_text ?? payload.slot ?? 'kein Wunschtermin'

  if (payload.source === 'sv_embed' && variante === 'A' && site) {
    // Variante A: nur WhatsApp an den SV
    const text =
      `Neue Anfrage über Ihr Claimondo-Formular:\n` +
      `${kunde} · ${payload.telefon}\n` +
      `Wunschtermin: ${slot}`
    try {
      await sendNachricht({
        entity: 'gfa',
        entityId: anfrageId,
        phone: site.baileys_routing_nummer,
        text,
        empfaengerRolle: 'sachverstaendiger',
        templateKey: 'embed_anfrage_a',
      })
    } catch (err) {
      console.error('[AAR-939] notify A (WA) fehlgeschlagen:', err)
    }
    return
  }

  // Variante B + Cluster-LP -> Dispatch-Email
  const betreff =
    payload.source === 'kfz_gutachter_lp'
      ? `Neue Cluster-Anfrage (${payload.cluster ?? stadt})`
      : `Neue Embed-Anfrage (${site?.slug ?? 'SV'})`
  const html =
    `<p>Neue Anfrage über Monika-Embed:</p>` +
    `<ul>` +
    `<li><strong>Name:</strong> ${kunde}</li>` +
    `<li><strong>Telefon:</strong> ${payload.telefon}</li>` +
    `<li><strong>Quelle:</strong> ${payload.source}${variante ? ` (Variante ${variante})` : ''}</li>` +
    `<li><strong>Stadt:</strong> ${stadt}</li>` +
    `<li><strong>Wunschtermin:</strong> ${slot}</li>` +
    `</ul>` +
    `<p>Im Dispatch unter Gutachter-Finder-Anfragen sichtbar.</p>`
  try {
    await sendEmail({
      to: DISPATCH_EMAIL,
      subject: betreff,
      html,
      empfaengerTyp: 'admin',
      template: 'embed_anfrage_dispatch',
    })
  } catch (err) {
    console.error('[AAR-939] notify Dispatch (Email) fehlgeschlagen:', err)
  }

  // Cluster-LP: zusaetzlich WhatsApp an Aaron
  if (payload.source === 'kfz_gutachter_lp') {
    const target = process.env.KFZ_LP_BAILEYS_TARGET
    if (target) {
      const text = `Neue Cluster-Anfrage (${payload.cluster ?? stadt}):\n${kunde} · ${payload.telefon}\nWunschtermin: ${slot}`
      try {
        await sendNachricht({
          entity: 'gfa',
          entityId: anfrageId,
          phone: target,
          text,
          empfaengerRolle: 'dispatch',
          templateKey: 'embed_anfrage_cluster',
        })
      } catch (err) {
        console.error('[AAR-939] notify Cluster (WA) fehlgeschlagen:', err)
      }
    }
  }
}
