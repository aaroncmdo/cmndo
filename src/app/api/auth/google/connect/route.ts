// AAR-96: Mitarbeiter Google OAuth Connect (Authorization Code Flow Init)
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { externalUrl, externalOrigin } from '@/lib/external-url'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) {
    return NextResponse.redirect(externalUrl(req, '/login'))
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  // Hinter nginx ist req.url die interne Origin (0.0.0.0:3001) → externalOrigin
  // statt new URL(req.url).origin, sonst leakt die redirect_uri 0.0.0.0.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? externalOrigin(req)
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(externalUrl(req, '/admin/einstellungen/google?error=not_configured'))
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/auth/google/callback`,
  )

  // AAR-google-cal-drift: return-Param damit SV nach Connect zurück in seinen
  // Kalender-Tab landet (vorher hardcoded Admin-Settings-Page).
  // Format: state = "<user-id>|<return-path>" — Callback parsed das wieder.
  // calendar.readonly für FreeBusy-Slot-Anzeige + calendar.events für Sync.
  const returnTo = req.nextUrl.searchParams.get('return') ?? '/admin/einstellungen/google?success=1'
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: `${user.id}|${returnTo}`,
  })

  return NextResponse.redirect(url)
}
