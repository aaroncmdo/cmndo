// SP5a: Microsoft OAuth Callback (code -> tokens, raw fetch). Env-gated.
// Mirror von /api/auth/google/callback.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { externalUrl, externalOrigin } from '@/lib/external-url'
import { MS_TOKEN_ENDPOINT, MS_SCOPES } from '@/lib/microsoft/graph-client'
import { upsertOAuthTokens } from '@/lib/oauth/secrets'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  // state = "<user-id>|<return-path>"
  const [stateUserId, ...returnParts] = (state ?? '').split('|')
  const rawReturn = returnParts.length > 0 ? returnParts.join('|') : '/mitarbeiter/profil'
  const safeReturn = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/mitarbeiter/profil'

  if (oauthError || !code || !state) {
    return NextResponse.redirect(externalUrl(req, `${safeReturn}?ms_error=${oauthError ?? 'invalid'}`))
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user || user.id !== stateUserId) {
    return NextResponse.redirect(externalUrl(req, '/login'))
  }

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? externalOrigin(req)
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(externalUrl(req, `${safeReturn}?ms_error=not_configured`))
  }

  let tok: { access_token?: string; refresh_token?: string; expires_in?: number }
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${baseUrl}/api/auth/microsoft/callback`,
      grant_type: 'authorization_code',
      scope: MS_SCOPES,
    })
    const resp = await fetch(MS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!resp.ok) {
      console.error('[ms-oauth] token exchange:', resp.status, await resp.text().catch(() => ''))
      return NextResponse.redirect(externalUrl(req, `${safeReturn}?ms_error=token_exchange`))
    }
    tok = (await resp.json()) as typeof tok
  } catch (err) {
    console.error('[ms-oauth] token exchange error:', err)
    return NextResponse.redirect(externalUrl(req, `${safeReturn}?ms_error=token_exchange`))
  }

  if (!tok.refresh_token) {
    return NextResponse.redirect(externalUrl(req, `${safeReturn}?ms_error=no_refresh_token`))
  }

  // Email via Graph /me (mail bevorzugt, sonst userPrincipalName)
  let msEmail: string | null = null
  try {
    const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    if (meResp.ok) {
      const me = (await meResp.json()) as { mail?: string | null; userPrincipalName?: string | null }
      msEmail = me.mail ?? me.userPrincipalName ?? null
    }
  } catch (err) {
    console.error('[ms-oauth] /me fetch:', err)
  }

  const adminDb = createAdminClient()
  // Tokens in die service-role-only Secret-Tabelle (Leak-Fix); email/connected_at bleiben benign auf profiles.
  await upsertOAuthTokens(adminDb, user.id, 'ms', {
    refreshToken: tok.refresh_token,
    accessToken: tok.access_token ?? null,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
  })
  await adminDb.from('profiles').update({
    ms_email: msEmail,
    ms_connected_at: new Date().toISOString(),
  }).eq('id', user.id)

  return NextResponse.redirect(externalUrl(req, safeReturn))
}
