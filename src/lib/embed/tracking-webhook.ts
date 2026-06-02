import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type TrackingEvent,
  type TrackingGfaRow,
  type PostResult,
  buildTrackingPayload,
  signPayload,
  postWithRetry,
} from './tracking-webhook-core'

/**
 * AAR-939 Stream 8b — Server-Orchestrator des SV-Tracking-Webhooks (Ebene 2).
 *
 * Feuert HMAC-signiert an embed_sites.tracking_webhook_url, sobald eine Monika-
 * Anfrage einen trackbaren Status erreicht. Fire-and-forget: JEDER Aufruf wird
 * vom Caller in try/catch gewrappt (non-fatal) — ein Webhook-Fail darf nie
 * Anfrage-Insert / Termin-Booking / Termin-Abschluss brechen.
 *
 * Resolver: termin_vereinbart kommt mit leadId, termin_durchgefuehrt mit terminId
 * -> beide werden ueber gfa.konvertiert_zu_lead_id auf die embed-B-Anfrage
 * aufgeloest. anfrage_eingegangen hat die anfrageId direkt.
 *
 * Gate: nur source='sv_embed' mit gesetzter tracking_webhook_url (+ secret) feuert;
 * Cluster-LP / native / A-ohne-URL -> skipped (no-op).
 */

// gfa-/embed_sites-tracking-Spalten sind noch nicht in database.types -> any-Cast
// auf den admin client (gleiches Muster wie billing-actions / embed-Cron).
const GFA_TRACKING_COLUMNS =
  'id, vorname, nachname, gclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ga_client_id, embed_site_id, source, variante'

type FireRef =
  | { event: 'anfrage_eingegangen'; anfrageId: string }
  | { event: 'termin_vereinbart'; leadId: string }
  | { event: 'termin_durchgefuehrt'; terminId: string }

export type FireResult = { ok: boolean; status?: number | null; skipped?: boolean; error?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/** Loest die referenzierte embed-B-Anfrage-ID auf (oder null = nicht trackbar). */
async function resolveAnfrageId(db: AnyDb, ref: FireRef): Promise<string | null> {
  if (ref.event === 'anfrage_eingegangen') return ref.anfrageId

  let leadId: string | null = null
  if (ref.event === 'termin_vereinbart') {
    leadId = ref.leadId
  } else {
    const { data: termin } = await db
      .from('gutachter_termine')
      .select('lead_id, claim_id')
      .eq('id', ref.terminId)
      .maybeSingle()
    leadId = (termin?.lead_id as string | null) ?? null
    if (!leadId && termin?.claim_id) {
      const { data: claim } = await db
        .from('claims')
        .select('lead_id')
        .eq('id', termin.claim_id as string)
        .maybeSingle()
      leadId = (claim?.lead_id as string | null) ?? null
    }
  }
  if (!leadId) return null

  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id')
    .eq('konvertiert_zu_lead_id', leadId)
    .eq('source', 'sv_embed')
    .eq('variante', 'B')
    .maybeSingle()
  return (gfa?.id as string | null) ?? null
}

async function writeLastStatus(db: AnyDb, embedSiteId: string, res: PostResult): Promise<void> {
  try {
    await db
      .from('embed_sites')
      .update({
        tracking_webhook_last_status: res.status != null ? String(res.status) : res.error ? 'error' : 'unknown',
        tracking_webhook_last_at: new Date().toISOString(),
        tracking_webhook_last_error: res.ok ? null : res.error ?? `HTTP ${res.status}`,
      })
      .eq('id', embedSiteId)
  } catch (err) {
    console.error('[AAR-939 8b] last_* write failed:', err instanceof Error ? err.message : err)
  }
}

export async function fireTrackingWebhook(ref: FireRef): Promise<FireResult> {
  const db = createAdminClient() as AnyDb

  const anfrageId = await resolveAnfrageId(db, ref)
  if (!anfrageId) return { ok: true, skipped: true }

  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select(GFA_TRACKING_COLUMNS)
    .eq('id', anfrageId)
    .maybeSingle()
  if (!gfa || gfa.source !== 'sv_embed' || !gfa.embed_site_id) return { ok: true, skipped: true }

  const { data: site } = await db
    .from('embed_sites')
    .select('slug, tracking_webhook_url, tracking_webhook_secret, einzelpreis_eur')
    .eq('id', gfa.embed_site_id as string)
    .maybeSingle()
  if (!site?.tracking_webhook_url || !site?.tracking_webhook_secret) return { ok: true, skipped: true }

  const valueEur = ref.event === 'termin_durchgefuehrt' ? Number(site.einzelpreis_eur ?? 70) : null
  const payload = buildTrackingPayload({
    event: ref.event as TrackingEvent,
    gfa: gfa as TrackingGfaRow,
    embedSiteSlug: site.slug as string,
    valueEur,
    ts: new Date().toISOString(),
  })
  const body = JSON.stringify(payload)
  const signature = signPayload(body, site.tracking_webhook_secret as string)

  const res = await postWithRetry(site.tracking_webhook_url as string, body, signature)
  await writeLastStatus(db, gfa.embed_site_id as string, res)

  if (!res.ok) {
    Sentry.captureMessage('Monika tracking-webhook failed', {
      level: 'warning',
      extra: { anfrageId, event: ref.event, status: res.status, error: res.error },
    })
  }
  return { ok: res.ok, status: res.status, error: res.error }
}
