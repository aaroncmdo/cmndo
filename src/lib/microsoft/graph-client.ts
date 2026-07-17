// SP5a: Microsoft-Graph-OAuth-Helper (Pendant zu google/oauth-client.ts, raw fetch —
// keine neue Dependency). Env-gated (MICROSOFT_OAUTH_CLIENT_ID/SECRET).
// getMicrosoftAccessTokenForUser liefert ein gueltiges Access-Token (mit Refresh) oder
// null; SP5b nutzt es fuer Graph-Calendar-Calls.
import { createAdminClient } from '@/lib/supabase/admin'
import { readOAuthTokens, upsertOAuthTokens } from '@/lib/oauth/secrets'

// 'common' = persoenliche (outlook.com) UND work/school (M365) Accounts.
export const MS_AUTHORIZE_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
export const MS_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
export const MS_SCOPES = 'offline_access Calendars.ReadWrite User.Read'

/** Braucht das Token einen Refresh? Kein/abgelaufenes (< now+60s Puffer) → true. Pure. */
export function msTokenNeedsRefresh(expiresAtIso: string | null, nowMs: number): boolean {
  if (!expiresAtIso) return true
  return new Date(expiresAtIso).getTime() <= nowMs + 60_000
}

/** Gueltiges MS-Graph-Access-Token fuer den User (mit Refresh) oder null. Env-gated, fail-soft. */
export async function getMicrosoftAccessTokenForUser(userId: string): Promise<string | null> {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const db = createAdminClient()
  const secret = await readOAuthTokens(db, userId, 'ms')
  if (!secret?.refreshToken) return null

  if (secret.accessToken && !msTokenNeedsRefresh(secret.expiresAt, Date.now())) {
    return secret.accessToken
  }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: secret.refreshToken,
      scope: MS_SCOPES,
    })
    const resp = await fetch(MS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!resp.ok) {
      console.warn('[ms-graph] refresh fehlgeschlagen:', resp.status)
      return null
    }
    const tok = (await resp.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!tok.access_token) return null
    await upsertOAuthTokens(db, userId, 'ms', {
      accessToken: tok.access_token,
      expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
      ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
    })
    return tok.access_token
  } catch (err) {
    console.warn('[ms-graph] refresh error:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function isMicrosoftConnected(userId: string): Promise<boolean> {
  const db = createAdminClient()
  const secret = await readOAuthTokens(db, userId, 'ms')
  return !!secret?.refreshToken
}
