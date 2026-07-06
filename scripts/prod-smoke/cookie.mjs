// Encode a GoTrue session into @supabase/ssr auth cookies (Playwright-ready).
// Uses the app's OWN createChunks so the wire format matches exactly what
// createServerClient() reads back (chunk size 3180, name sb-<ref>-auth-token).
// The value encoding is `base64-` + base64url(JSON) — identical to the lib's
// stringToBase64URL (= Buffer.toString('base64url')), inlined to avoid the
// fragile deep dist import.
import { createChunks } from '@supabase/ssr'

/**
 * @param session GoTrue token-endpoint response (access_token, refresh_token, expires_at, expires_in, token_type, user)
 * @param opts { projectRef: 'paizkjaj...', cookieDomain: '.claimondo.de' }
 * @returns Playwright-ready cookie objects (1+ chunks)
 */
export function sessionToCookies(session, { projectRef, cookieDomain }) {
  const name = `sb-${projectRef}-auth-token`
  const stored = {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }
  const encoded = 'base64-' + Buffer.from(JSON.stringify(stored)).toString('base64url')
  return createChunks(name, encoded).map((c) => ({
    name: c.name,
    value: c.value,
    domain: cookieDomain,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }))
}
