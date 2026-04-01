import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/gutachter/profil?error=no_code', req.url))

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google-calendar/callback`

  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/gutachter/profil?error=config', req.url))

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.access_token) return NextResponse.redirect(new URL('/gutachter/profil?error=token_exchange', req.url))

    // Get user
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.redirect(new URL('/login', req.url))

    // Save tokens
    const svc = createServiceClient()
    await svc.from('sachverstaendige').update({
      gcal_access_token: tokens.access_token,
      gcal_refresh_token: tokens.refresh_token ?? null,
      gcal_token_expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      gcal_connected: true,
    }).eq('profile_id', user.id)

    return NextResponse.redirect(new URL('/gutachter/profil?gcal=connected', req.url))
  } catch {
    return NextResponse.redirect(new URL('/gutachter/profil?error=oauth_failed', req.url))
  }
}
