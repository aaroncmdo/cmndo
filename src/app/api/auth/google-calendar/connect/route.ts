import { type NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  // AAR-160: Production-Fallback statt localhost (Serverless ECONNREFUSED).
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'}/api/auth/google-calendar/callback`

  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID nicht konfiguriert' }, { status: 500 })

  // AAR-242 Audit: return-URL via OAuth state-Parameter durchreichen, damit
  // Callback weiß wohin redirected werden soll (z.B. Willkommen-Wizard
  // statt Default Profil).
  const returnTo = req.nextUrl.searchParams.get('return') ?? '/gutachter/profil?gcal=connected'
  const state = encodeURIComponent(returnTo)

  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events')
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`

  return NextResponse.redirect(url)
}
