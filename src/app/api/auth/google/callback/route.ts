// AAR-96: Mitarbeiter Google OAuth Callback (tauscht code -> tokens)
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(new URL(`/admin/einstellungen/google?error=${error ?? 'invalid'}`, req.url))
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user || user.id !== state) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/admin/einstellungen/google?error=not_configured', req.url))
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/auth/google/callback`,
  )

  let tokens
  try {
    const tokenResponse = await oauth2Client.getToken(code)
    tokens = tokenResponse.tokens
  } catch (err) {
    console.error('[AAR-96] Token exchange failed:', err)
    return NextResponse.redirect(new URL('/admin/einstellungen/google?error=token_exchange', req.url))
  }

  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL('/admin/einstellungen/google?error=no_refresh_token', req.url))
  }

  // Google Email holen
  oauth2Client.setCredentials(tokens)
  let googleEmail: string | null | undefined
  try {
    const userinfo = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get()
    googleEmail = userinfo.data.email
  } catch (err) {
    console.error('[AAR-96] Userinfo fetch failed:', err)
  }

  const adminDb = createAdminClient()
  await adminDb.from('profiles').update({
    google_refresh_token: tokens.refresh_token,
    google_access_token: tokens.access_token ?? null,
    google_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    google_email: googleEmail ?? null,
    google_connected_at: new Date().toISOString(),
  }).eq('id', user.id)

  return NextResponse.redirect(new URL('/admin/einstellungen/google?success=1', req.url))
}
