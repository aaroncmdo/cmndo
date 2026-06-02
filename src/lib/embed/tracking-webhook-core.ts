// AAR-939 Stream 8b — Pure Kern des SV-Tracking-Webhooks.
//
// Bewusst KEIN 'server-only': vitest importiert dieses Modul direkt (Payload-Bau,
// HMAC-Signatur, Retry mit injizierbarem fetch/sleep). node:crypto ist im
// Node-/Test-Runtime verfuegbar; dieses Modul wird NUR vom server-only
// Orchestrator (tracking-webhook.ts) + dem Test importiert, nie vom Client.

import { createHmac } from 'node:crypto'

export type TrackingEvent =
  | 'anfrage_eingegangen'
  | 'termin_vereinbart'
  | 'termin_durchgefuehrt'
  | 'test'

/** Die Attributions-Felder der gfa-Zeile, die in den Webhook gehen. */
export interface TrackingGfaRow {
  id: string
  vorname: string | null
  nachname: string | null
  gclid: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  ga_client_id: string | null
}

export interface TrackingPayload {
  event: TrackingEvent
  anfrage_id: string
  embed_site_slug: string
  name: string | null
  gclid: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  ga_client_id: string | null
  value_eur: number | null
  ts: string
}

export function buildTrackingPayload(args: {
  event: TrackingEvent
  gfa: TrackingGfaRow
  embedSiteSlug: string
  valueEur: number | null
  ts: string
}): TrackingPayload {
  const { event, gfa, embedSiteSlug, valueEur, ts } = args
  const name = [gfa.vorname, gfa.nachname].filter(Boolean).join(' ').trim() || null
  return {
    event,
    anfrage_id: gfa.id,
    embed_site_slug: embedSiteSlug,
    name,
    gclid: gfa.gclid,
    utm_source: gfa.utm_source,
    utm_medium: gfa.utm_medium,
    utm_campaign: gfa.utm_campaign,
    utm_term: gfa.utm_term,
    utm_content: gfa.utm_content,
    ga_client_id: gfa.ga_client_id,
    value_eur: valueEur,
    ts,
  }
}

/** HMAC-SHA256 ueber den Roh-Body, Prefix "sha256=" (GitHub-Webhook-Konvention). */
export function signPayload(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

export interface PostResult {
  ok: boolean
  status: number | null
  error?: string
}

/**
 * POST mit n Versuchen + Backoff. fetch/sleep injizierbar (Test). Erfolg = 2xx.
 * Wirft NIE — liefert immer ein PostResult (letzter Versuch).
 */
export async function postWithRetry(
  url: string,
  body: string,
  signature: string,
  opts?: {
    attempts?: number
    backoffMs?: number[]
    fetchImpl?: typeof fetch
    sleep?: (ms: number) => Promise<void>
    timeoutMs?: number
  },
): Promise<PostResult> {
  const attempts = opts?.attempts ?? 3
  const backoff = opts?.backoffMs ?? [0, 1000, 4000]
  const doFetch = opts?.fetchImpl ?? fetch
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const timeoutMs = opts?.timeoutMs ?? 8000

  let last: PostResult = { ok: false, status: null, error: 'no_attempt' }
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(backoff[i] ?? backoff[backoff.length - 1] ?? 1000)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Claimondo-Signature': signature },
        body,
        signal: ctrl.signal,
      })
      last = { ok: resp.ok, status: resp.status }
      if (resp.ok) return last
    } catch (err) {
      last = { ok: false, status: null, error: err instanceof Error ? err.message : String(err) }
    } finally {
      clearTimeout(timer)
    }
  }
  return last
}
