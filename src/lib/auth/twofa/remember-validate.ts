import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// F1 (2FA-Bypass-Fix, AAR-audit-2fa): Echte Validierung des Trusted-Device-
// Remember-Tokens. Ersetzt die fruehere reine Cookie-Praesenz-Pruefung in der
// Middleware (`!!cookie.value`), die 2FA trivial umgehbar machte (jeder mit
// Passwort setzt claimondo_remember=1 -> Gate 'allow'). Web-Crypto SHA-256 ->
// laeuft in Edge- UND Node-Proxy-Runtime. Fail-closed: jeder Fehler -> false.
//
// RLS auf auth_remember_tokens erlaubt dem authentifizierten User-Client die
// eigene Zeile (USING: admin OR user_id = auth.uid()) -> kein Service-Role noetig.

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Validiert das `claimondo_remember`-Cookie (`<userId>:<rawToken>`) gegen
 * `auth_remember_tokens`. true nur wenn cookieUserId === sessionUserId UND
 * der SHA-256(rawToken) als nicht-revoked, nicht-expired Zeile existiert.
 */
export async function validateRememberCookie(
  supabase: SupabaseClient<Database>,
  sessionUserId: string,
  cookieValue: string | undefined,
): Promise<boolean> {
  try {
    if (!cookieValue) return false
    const sep = cookieValue.indexOf(':')
    if (sep <= 0) return false
    const cookieUserId = cookieValue.slice(0, sep)
    const rawToken = cookieValue.slice(sep + 1)
    if (!rawToken || cookieUserId !== sessionUserId) return false

    const tokenHash = await sha256Hex(rawToken)
    const { data, error } = await supabase
      .from('auth_remember_tokens')
      .select('id, expires_at')
      .eq('user_id', sessionUserId)
      .eq('token_hash', tokenHash)
      .is('revoked_am', null)
      .maybeSingle()

    if (error || !data) return false
    if (new Date((data as { expires_at: string }).expires_at).getTime() < Date.now()) return false
    return true
  } catch {
    return false
  }
}
