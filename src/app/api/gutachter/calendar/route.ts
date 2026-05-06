// 2026-05-06 OAuth-Konsolidierung: Endpoint zieht Google-Calendar-Events
// für die SV-Kalender-Anzeige. Liest jetzt Tokens aus profiles.google_*
// via getGoogleOAuthClientForUser — selber Pfad wie alle anderen Sync-
// Reader (sv-termin-sync, busy-slots, FreeBusy). Vorher las er aus
// sachverstaendige.gcal_*, was nach AAR-694 zu einer Doppel-Wahrheit
// führte und dazu, dass refreshte Tokens nie ankamen.

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const start = req.nextUrl.searchParams.get('start') ?? new Date().toISOString()
  const end = req.nextUrl.searchParams.get('end') ?? new Date(Date.now() + 7 * 86400000).toISOString()

  const auth = await getGoogleOAuthClientForUser(user.id)
  if (!auth) {
    return NextResponse.json({ events: [], connected: false })
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const r = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })
    const events = (r.data.items ?? []).map((e) => ({
      id: e.id,
      title: e.summary ?? 'Kein Titel',
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      location: e.location ?? null,
    }))
    return NextResponse.json({ events, connected: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/invalid_grant/i.test(msg)) {
      return NextResponse.json({ events: [], connected: false, error: 'Token abgelaufen' })
    }
    return NextResponse.json({ events: [], connected: true, error: 'Fetch fehlgeschlagen' })
  }
}
