'use server'

// RLS-Phase-1 #4 Batch 4 — Signatur-Server-Action-Refactor.
//
// Bisher haben FlowWizardKfz + SignaturPage Unterschrift-Blobs direkt
// mit dem Anon-Key in den `unterschriften`-Bucket gepusht. Das war die
// direkte Anon-Write-Lücke aus dem Live-RLS-Audit (HIGH #4).
//
// Beide Clients rufen jetzt diese Server-Actions auf. Upload läuft mit
// createAdminClient (service_role) — der Anon-Write auf `unterschriften`
// kann mit Schritt D entfernt werden, ohne die Strecke zu brechen.
//
// Validierung:
//  - uploadFlowSignatur: Token muss in flow_links existieren und aktiv sein.
//  - uploadFallSignatur: Fall-ID muss in faelle existieren.
//
// Beide Actions liefern die URL via getStorageUrl, sodass Flag-on signed-URLs
// generiert und Flag-off Public-URLs zurückgibt (heute-Verhalten).

import { createAdminClient } from '@/lib/supabase/admin'
import { getStorageUrl } from '@/lib/storage/url'

type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — eine Signatur reicht großzügig

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mime = match[1]
  if (!ALLOWED_MIME.has(mime)) return null
  try {
    const buf = Buffer.from(match[2], 'base64')
    if (buf.length === 0 || buf.length > MAX_BYTES) return null
    return { bytes: new Uint8Array(buf), mime }
  } catch {
    return null
  }
}

/**
 * Lädt eine Unterschrift für einen aktiven Flow-Link in `unterschriften`.
 * Pfad: `flow/{token}/sa_{ts}.png`
 */
export async function uploadFlowSignatur(
  token: string,
  base64DataUrl: string,
): Promise<UploadResult> {
  if (!token) return { ok: false, error: 'Token fehlt' }

  const admin = createAdminClient()

  const { data: flow } = await admin
    .from('flow_links')
    .select('lead_id, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!flow?.lead_id) return { ok: false, error: 'Flow-Link ungültig' }
  if (flow.status === 'abgeschlossen') return { ok: false, error: 'Flow-Link bereits abgeschlossen' }
  if (flow.expires_at && new Date(flow.expires_at as string) < new Date()) {
    return { ok: false, error: 'Flow-Link abgelaufen' }
  }

  const decoded = decodeDataUrl(base64DataUrl)
  if (!decoded) return { ok: false, error: 'Ungültige oder zu große Bilddaten' }

  const path = `flow/${token}/sa_${Date.now()}.png`
  const { error: upErr } = await admin.storage
    .from('unterschriften')
    .upload(path, decoded.bytes, { contentType: decoded.mime, upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  const url = await getStorageUrl(admin, 'unterschriften', path)
  if (!url) return { ok: false, error: 'URL-Generierung fehlgeschlagen' }
  return { ok: true, url }
}

/**
 * Lädt Abtretungs- oder Vollmachts-Unterschrift für einen existierenden Fall.
 * Pfad: `{fallId}/{kind}_{ts}.png`
 */
export async function uploadFallSignatur(
  fallId: string,
  base64DataUrl: string,
  kind: 'abtretung' | 'vollmacht',
): Promise<UploadResult> {
  if (!fallId) return { ok: false, error: 'Fall-ID fehlt' }
  if (kind !== 'abtretung' && kind !== 'vollmacht') {
    return { ok: false, error: 'Ungültiger Signatur-Typ' }
  }

  const admin = createAdminClient()
  const { data: fall } = await admin
    .from('faelle')
    .select('id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'Fall nicht gefunden' }

  const decoded = decodeDataUrl(base64DataUrl)
  if (!decoded) return { ok: false, error: 'Ungültige oder zu große Bilddaten' }

  const path = `${fallId}/${kind}_${Date.now()}.png`
  const { error: upErr } = await admin.storage
    .from('unterschriften')
    .upload(path, decoded.bytes, { contentType: decoded.mime, upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  const url = await getStorageUrl(admin, 'unterschriften', path)
  if (!url) return { ok: false, error: 'URL-Generierung fehlgeschlagen' }
  return { ok: true, url }
}
