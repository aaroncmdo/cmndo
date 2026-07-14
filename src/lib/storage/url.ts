// RLS-Phase-1 #4 (13.05.2026): Storage-URL-Helper mit Feature-Flag.
//
// Default-Verhalten: Public-URL (heute-Stand, 4 Buckets public=true).
// Mit STORAGE_USE_SIGNED_URLS=true: signed-URL via createSignedUrl mit TTL.
//
// Rollout-Plan: docs/13.05.2026/storage-rls-rollout-plan.md
// Spec: docs/superpowers/specs/2026-05-13-rls-hardening-phase-1-design.md §5
//
// Pattern:
//   const url = await getStorageUrl(supabase, 'gutachten', path)
//   // → Public-URL solange Flag off, signed-URL wenn on
//
// Sobald alle ~48 Caller via diesen Helper laufen, kann die DB-Migration
// (public=false + per-Fall-Policies) angewandt werden — das Flag flippt
// dann den App-Layer atomar mit der DB-Änderung.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * TTL in Sekunden für signed URLs.
 *
 * - `ui` (1h): UI-Embeds in eingeloggten Seiten — Browser cacht, Render-Zeit reicht.
 * - `download` (5min): Sofort-Downloads über Button-Klicks.
 * - `email` (7d): Email-/Push-Notification-Embeds — Empfänger öffnet evtl. später.
 *   Alternative: Authenticated-Proxy-Route (siehe Rollout-Plan §C).
 */
export const STORAGE_TTL = {
  ui: 60 * 60,
  download: 5 * 60,
  email: 7 * 24 * 60 * 60,
} as const

export type StorageUrlContext = keyof typeof STORAGE_TTL

export type GetStorageUrlOptions = {
  /** TTL in Sekunden (Default: STORAGE_TTL.ui = 1h). */
  ttl?: number
  /** Context-Hint anstelle von expliziter TTL. */
  context?: StorageUrlContext
  /** Force-Download-Header setzen (Content-Disposition: attachment). */
  download?: boolean
}

function useSignedUrls(): boolean {
  return process.env.STORAGE_USE_SIGNED_URLS === 'true'
}

/**
 * Liefert eine URL zu einer Storage-Datei.
 *
 * - Wenn `STORAGE_USE_SIGNED_URLS=true`: signed URL via `createSignedUrl`.
 *   TTL aus `opts.ttl` oder `STORAGE_TTL[opts.context]` oder Default 1h.
 * - Sonst: `getPublicUrl` (heute-Verhalten, kein Behavior-Change ohne ENV-Flag).
 *
 * Liefert `null` wenn signed-URL-Generierung fehlschlägt (z.B. Datei existiert nicht).
 * Public-URL-Pfad liefert immer einen String — Validierung des Pfades ist Caller-Aufgabe.
 */
export async function getStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  opts: GetStorageUrlOptions = {},
): Promise<string | null> {
  if (!path) return null

  if (useSignedUrls()) {
    const ttl = opts.ttl ?? STORAGE_TTL[opts.context ?? 'ui']
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttl, opts.download ? { download: true } : undefined)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Zerlegt eine GESPEICHERTE Storage-URL wieder in Bucket + Pfad.
 *
 * Erkennt alle drei Supabase-Formen (`/object/public|sign|authenticated/<bucket>/<pfad>`),
 * wirft den `?token=`-Query weg und dekodiert prozent-kodierte Pfadsegmente.
 * Liefert `null` für Nicht-Storage-URLs (z.B. `/claimondo-logo.svg`) und Leerwerte.
 */
export function parseStorageUrl(
  url: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!url) return null
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/)
  if (!m) return null
  const bucket = m[1]
  let path = m[2]
  if (!bucket || !path) return null
  try {
    path = decodeURIComponent(path)
  } catch {
    /* kaputte %-Sequenz: roh weiterreichen */
  }
  return path ? { bucket, path } : null
}

/**
 * Macht eine GESPEICHERTE Storage-URL wieder abrufbar, indem sie FRISCH signiert wird.
 *
 * Warum nötig: eine einmal in der DB abgelegte Storage-URL ist kein dauerhafter Zugriff.
 * Bei `STORAGE_USE_SIGNED_URLS=true` läuft sie nach ihrer TTL ab; ist das Flag aus, ist es
 * eine `getPublicUrl` — die auf einem PRIVATEN Bucket (z.B. `fall-dokumente`) HTTP 400
 * liefert. Wer so eine URL später wiederverwendet — insbesondere wenn ein FREMDER Dienst
 * sie ohne Auth fetcht (Anthropic-Vision holt Bilder per `source.type='url'`) — muss sie
 * neu signieren. `supabase` sollte daher ein Client mit Storage-Rechten sein (Admin).
 *
 * Liefert `null`, wenn die URL keine Storage-URL ist oder das Signieren fehlschlägt.
 */
export async function resignStorageUrl(
  supabase: SupabaseClient,
  storedUrl: string | null | undefined,
  ttl: number = STORAGE_TTL.ui,
): Promise<string | null> {
  const parsed = parseStorageUrl(storedUrl)
  if (!parsed) return null
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, ttl)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Bulk-Variante für Listen-Views — generiert N URLs parallel.
 * Items mit leerem Pfad → null im selben Index.
 *
 * Performance-Hinweis: bei `useSignedUrls()=true` macht createSignedUrl N
 * Roundtrips zur Supabase-API (kein bulk-Endpoint). Bei großen Listen lieber
 * lazy auf-Abruf statt eager-batch.
 */
export async function getStorageUrlBulk(
  supabase: SupabaseClient,
  items: Array<{ bucket: string; path: string | null | undefined }>,
  opts: GetStorageUrlOptions = {},
): Promise<Array<string | null>> {
  return Promise.all(
    items.map(({ bucket, path }) =>
      path ? getStorageUrl(supabase, bucket, path, opts) : Promise.resolve(null),
    ),
  )
}
