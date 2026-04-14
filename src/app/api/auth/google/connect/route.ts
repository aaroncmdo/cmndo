// AAR-96: Mitarbeiter Google OAuth Connect (Authorization Code Flow Init)
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/admin/einstellungen/google?error=not_configured', req.url))
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/auth/google/callback`,
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: user.id,
  })

  return NextResponse.redirect(url)
}
