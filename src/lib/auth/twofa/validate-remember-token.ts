import type { SupabaseClient } from '@supabase/supabase-js'

// AAR-auth-haertung: Edge-sichere Validierung des Trusted-Device-Tokens.
//
// Die Middleware (proxy/edge runtime) kann weder node:crypto (createHash) noch
// next/headers (cookies()) nutzen. Darum hier Web-Crypto (crypto.subtle, in
// Edge UND Node verfuegbar) und der Cookie-Wert wird als Parameter uebergeben
// (aus request.cookies). SHA-256 ist identisch zu createHash('sha256') in
// remember-me.ts, mit dem die Token-Hashes geschrieben werden.
//
// Hintergrund: Vorher prüfte die Middleware nur `!!cookie` — jeder beliebige
// claimondo_remember-Wert umging damit die 2FA. Diese Funktion prueft die
// User-Bindung, den Token-Hash gegen auth_remember_tokens, revoked_am und
// den Ablauf.

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Prueft, ob `cookieValue` (Format `<userId>:<rawToken>`) ein gueltiges,
 * nicht widerrufenes, nicht abgelaufenes Trusted-Device-Token fuer `userId`
 * ist. `db` muss ein Client mit Lesezugriff auf `auth_remember_tokens` sein
 * (Service-Role — RLS-frei, analog zu remember-me.ts). `now` ist fuer Tests
 * injizierbar.
 */
export async function validateRememberToken(
  cookieValue: string | null | undefined,
  userId: string,
  db: Pick<SupabaseClient, 'from'>,
  now: Date = new Date(),
): Promise<boolean> {
  if (!cookieValue) return false
  const sep = cookieValue.indexOf(':')
  if (sep <= 0) return false
  const cookieUserId = cookieValue.slice(0, sep)
  const rawToken = cookieValue.slice(sep + 1)
  if (!rawToken || cookieUserId !== userId) return false

  const tokenHash = await sha256Hex(rawToken)
  const { data } = await db
    .from('auth_remember_tokens')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('token_hash', tokenHash)
    .is('revoked_am', null)
    .maybeSingle()

  if (!data) return false
  const valid = new Date((data as { expires_at: string }).expires_at) >= now
  if (valid) {
    // B (AAR-audit-trusted-devices): last_used_at aktualisieren (fuer die Geraete-
    // Verwaltungs-UI — sonst zeigt sie dauerhaft Erstellungszeit). Best-effort:
    // ein Fehler darf die Validierung nicht kippen. Laeuft nur im seltenen
    // Trusted-Device-Skip-Pfad, nicht auf jedem Request.
    try {
      await (db as { from: SupabaseClient['from'] })
        .from('auth_remember_tokens')
        .update({ last_used_at: now.toISOString() })
        .eq('id', (data as { id: string }).id)
    } catch {
      /* non-critical */
    }
  }
  return valid
}
