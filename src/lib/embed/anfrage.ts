import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNachricht } from '@/lib/whatsapp/send'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'
import { sendEmail } from '@/lib/email/google/client'
import type { EmbedAnfrageInput } from '@/lib/schemas/embed-anfrage'
import { fireTrackingWebhook } from '@/lib/embed/tracking-webhook'
import { buildAnfrageColumns, extractHost, splitName, type AnfrageVariante, type InsertAnfrageInput } from './anfrage-columns'
import { svBezeichnung, kundenBestaetigungText } from './kunde-bestaetigung'

/**
 * AAR-939 · Monika-Embed · Stream 2 — Anfrage-Verarbeitung (Shared)
 *
 * Single Source of Truth fuer den Empfang von Monika-Embed-Anfragen.
 * Cluster-LPs (source='kfz_gutachter_lp') UND SV-Embeds (source='sv_embed')
 * POSTen an /api/anfrage-from-lp, das diese Helper nutzt.
 *
 * Scope (Aaron 29.05.2026): Anfrage -> Lead -> Termin. KEIN Claim/Fall/Auftrag.
 * REUSE der bestehenden gutachter_finder_anfragen (kein neues anfragen-Table).
 * Writes laufen ausschliesslich via service_role (createAdminClient).
 *
 * Die PURE Spalten-Logik (splitName/buildAnfrageColumns) liegt in
 * ./anfrage-columns (server-only-frei → vitest-testbar) und wird hier re-exportiert.
 */

// Re-Export der PURE-Helfer/Typen — route.ts importiert AnfrageVariante weiterhin von hier.
export { buildAnfrageColumns, extractHost, splitName }
export type { AnfrageVariante, InsertAnfrageInput }

export interface EmbedSiteConfig {
  id: string
  slug: string
  /** AAR-939 P4: Anzeigename des Embeds (sv_embed-Bezeichnung in der Kunden-Bestaetigung). */
  name: string | null
  variante: AnfrageVariante
  /** AAR-939 Embed-B: callback (Default, SV-Rueckruf) | flowlink (Self-Service, /flow-Link). Orthogonal zu variante. */
  funnel_modus: 'callback' | 'flowlink'
  einzelpreis_eur: number
  empfaenger_email: string
  cc_email: string | null
  baileys_routing_nummer: string
  /** AAR-939 Monika-A-Flow: public tel:-Nummer fuer den Anruf-Button (NICHT baileys_routing_nummer). */
  sv_telefon: string | null
  erlaubte_domains: string[]
  max_anfragen_pro_h: number
  aktiv: boolean
}

// ── Helfer ─────────────────────────────────────────────────────────────────
// extractHost lebt jetzt PURE in ./anfrage-columns (Re-Export oben).

/** Cluster-LP-Domains, gegen die kfz_gutachter_lp-Anfragen validiert werden.
 *  Die 5 kanonischen Cluster-Domains sind IMMER erlaubt (hardcoded base);
 *  MONIKA_CLUSTER_DOMAINS ERGAENZT optional weitere (Preview/neue Cluster),
 *  statt die base zu ersetzen. Sonst sperrt ein stale Env still einzelne Cluster
 *  aus — Koeln/Aachen-Incident 2026-06-11: Submit lief in 403 origin_not_allowed,
 *  weil der alte Fallback/Env nur wuppertal/duesseldorf/bonn kannte. */
export function clusterAllowlist(): string[] {
  const base = [
    'kfz-unfallgutachter-wuppertal.de',
    'kfz-unfallgutachter-duesseldorf.de',
    'kfz-unfallgutachter-bonn.de',
    'kfz-unfallgutachter-koeln.de',
    'kfz-unfallgutachter-aachen.de',
    // claimondo.de: die 173 Stadtseiten /kfz-gutachter/<stadt> sind inhaltlich
    // dieselbe Gattung wie die Cluster-LPs und POSTen seit 21.08.2026 ebenfalls
    // hierher (source='kfz_gutachter_lp'). Vorher liefen sie ueber eine eigene
    // Server-Action gegen LEAD_WEBHOOK_URL — die Variable war nie gesetzt, also
    // bekam JEDER Absender "Konfigurationsfehler", und der Lead landete nirgends.
    // BEWUSST hardcoded statt via MONIKA_CLUSTER_DOMAINS: genau der Env-Weg hat
    // schon zweimal still ausgesperrt (Koeln/Aachen-Incident oben) bzw. gar nicht
    // existiert (LEAD_WEBHOOK_URL steht in KEINEM Deploy-Workflow).
    'claimondo.de',
  ]
  const env = process.env.MONIKA_CLUSTER_DOMAINS
  const extra = env ? env.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean) : []
  return [...new Set([...base, ...extra])]
}

/** Anon-Portal-Domains (generic_lp, z.B. autounfall.io), gegen die anon-Embed-Anfragen
 *  validiert werden. Nur via Env (MONIKA_ANON_DOMAINS) — getrennt von den Cluster-Domains,
 *  damit ein anon-Portal nicht versehentlich als Cluster-LP durchgeht. */
export function anonAllowlist(): string[] {
  const env = process.env.MONIKA_ANON_DOMAINS
  return env ? env.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean) : []
}

// ── Embed-Site laden ─────────────────────────────────────────────────────────

/** Laedt die aktive Embed-Site-Konfig per slug (service_role). */
export async function ladeEmbedSite(slug: string): Promise<EmbedSiteConfig | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('embed_sites')
    .select('id, slug, name, variante, funnel_modus, einzelpreis_eur, empfaenger_email, cc_email, baileys_routing_nummer, sv_telefon, erlaubte_domains, max_anfragen_pro_h, aktiv')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as EmbedSiteConfig
}

// ── Insert ───────────────────────────────────────────────────────────────────

export type InsertAnfrageResult =
  | { ok: true; anfrageId: string; status: string }
  | { ok: false; error: string }

/**
 * Schreibt eine Monika-Anfrage in gutachter_finder_anfragen (service_role).
 * Spalten-Map via buildAnfrageColumns (PURE, getestet). Status-Konvention:
 *   variante 'A' (free)               -> 'embed_free' (NICHT in Dispatch-Queue)
 *   variante 'B' (paid) + Cluster-LP  -> 'neu'        (Dispatch)
 */
export async function insertAnfrage(input: InsertAnfrageInput): Promise<InsertAnfrageResult> {
  const db = createAdminClient()
  const columns = buildAnfrageColumns(input)

  const { data, error } = await db
    .from('gutachter_finder_anfragen')
    .insert(columns)
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }
  }
  return { ok: true, anfrageId: data.id as string, status: columns.status as string }
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

  // AAR-939 8b: SV-Tracking-Webhook (Ebene 2). VOR den Notification-Branches, weil
  // der A-Branch frueh returnt. No-op fuer Cluster-LP / native / A-ohne-URL.
  // Non-fatal — der gfa-Insert steht bereits; ein Webhook-Fail beruehrt den Flow nicht.
  try {
    await fireTrackingWebhook({ event: 'anfrage_eingegangen', anfrageId })
  } catch (err) {
    console.error('[AAR-939 8b] tracking anfrage_eingegangen fehlgeschlagen:', err)
  }

  // AAR-956 16.06. (Aaron): Team-WhatsApp bei JEDER Anfrage-Submission. Cluster-LP
  // hat unten schon den KFZ_LP_BAILEYS_TARGET-Send -> hier nur die anderen Quellen
  // (sv_embed A/B), damit das Team auch ohne Cluster + ohne spaetere Reservierung
  // sofort eine WA bekommt. VOR den Varianten-Branches (Variante A returnt frueh).
  if (payload.source !== 'kfz_gutachter_lp') {
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
      const teamText = [
        '🆕 Neue Anfrage (Gutachter-Finder)',
        '',
        `👤 ${kunde}`,
        payload.telefon ? `📞 ${payload.telefon}` : null,
        `📍 ${stadt}`,
        `🗓️ Wunschtermin: ${slot}`,
        `↳ Quelle: ${payload.source}${variante ? ` · Variante ${variante}` : ''}`,
        '',
        `${base}/dispatch/gutachter-finder/${anfrageId}`,
      ]
        .filter(Boolean)
        .join('\n')
      await notifyTeamWhatsApp(teamText)
    } catch (err) {
      console.error('[AAR-956] Team-WA bei Anfrage fehlgeschlagen:', err)
    }
  }

  // AAR-939 P4: Kunden-Bestaetigung (Callback-Flow). Variante B laeuft nicht durch
  // notifyAnfrage → hier sind nur sv_embed-A + Cluster-LP. Best-effort: ein Fail darf
  // die SV-/Dispatch-Notify nicht brechen. WhatsApp zuerst, SMS-Fallback.
  // generic_lp (autounfall.io): KEINE Claimondo-WA/SMS an den Kunden — au.io-Standalone-
  // Stance (kein WA, nur in-app/Dispatch) + Footprint-Lock. Der Lead haengt trotzdem in
  // der Dispatch-Queue (gfa-Insert steht).
  // mcp (LLM-Chat): bekommt den FlowLink direkt (issueCanonicalFlowLinkForAnfrage, send:true)
  // statt dieser Callback-Bestaetigung — die "wir melden uns"-Nachricht waere redundant +
  // irrefuehrend. notifyAnfrage laeuft fuer mcp ohnehin nicht (der /api/v1/melde-schaden-
  // Endpoint ruft nur insertAnfrage); der Ausschluss haelt den Pfad typ-/semantik-korrekt.
  if (payload.telefon && payload.source !== 'generic_lp' && payload.source !== 'mcp') {
    const bezeichnung = svBezeichnung(
      { source: payload.source, cluster: payload.cluster ?? null },
      site?.name ?? null,
    )
    try {
      await sendNachricht({
        entity: 'gfa',
        entityId: anfrageId,
        phone: payload.telefon,
        text: kundenBestaetigungText(bezeichnung),
        fallback: ['sms'],
        empfaengerRolle: 'kunde',
        templateKey: 'embed_kunde_bestaetigung',
      })
    } catch (err) {
      console.error('[AAR-939 P4] Kunden-Bestaetigung fehlgeschlagen:', err)
    }
  }

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
