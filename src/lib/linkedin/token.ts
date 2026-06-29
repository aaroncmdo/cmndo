// src/lib/linkedin/token.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { LinkedInTokenRow } from './types'

const BUFFER_MS = 5 * 60 * 1000

export function isExpired(expiresAt: string, now: number, bufferMs = BUFFER_MS): boolean {
  return new Date(expiresAt).getTime() - bufferMs <= now
}

async function refresh(row: LinkedInTokenRow): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!row.refresh_token) return { ok: false, error: 'Kein refresh_token — bitte LinkedIn neu verbinden.' }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
  })
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params,
  })
  if (!res.ok) return { ok: false, error: `Token-Refresh fehlgeschlagen: ${res.status}` }
  const j = await res.json() as { access_token: string; expires_in: number; refresh_token?: string }
  const admin = createAdminClient()
  await admin.from('linkedin_oauth_tokens').update({
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
    aktualisiert_am: new Date().toISOString(),
  }).eq('id', row.id)
  return { ok: true, token: j.access_token }
}

export async function getValidLinkedInToken():
  Promise<{ ok: true; token: string; orgUrn: string } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data } = await admin.from('linkedin_oauth_tokens')
    .select('*').order('erstellt_am', { ascending: false }).limit(1).maybeSingle()
  const row = data as LinkedInTokenRow | null
  if (!row) return { ok: false, error: 'LinkedIn nicht verbunden.' }
  if (!isExpired(row.expires_at, Date.now())) return { ok: true, token: row.access_token, orgUrn: row.organization_urn }
  const r = await refresh(row)
  if (!r.ok) return r
  return { ok: true, token: r.token, orgUrn: row.organization_urn }
}
