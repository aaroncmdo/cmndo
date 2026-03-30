import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/kalender-eintragen
 * Creates a calendar entry for an SV in their external calendar (Google/Outlook)
 * and saves it in gutachter_termine.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json()
  const { sv_id, fall_id, start_zeit, end_zeit, titel, beschreibung } = body as {
    sv_id: string
    fall_id: string
    start_zeit: string
    end_zeit: string
    titel?: string
    beschreibung?: string
  }

  if (!sv_id || !fall_id || !start_zeit || !end_zeit) {
    return NextResponse.json({ error: 'sv_id, fall_id, start_zeit, end_zeit erforderlich' }, { status: 400 })
  }

  // Load SV calendar config
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, kalender_typ, kalender_sync_aktiv, google_calendar_token, outlook_calendar_token')
    .eq('id', sv_id)
    .single()

  if (!sv) return NextResponse.json({ error: 'Gutachter nicht gefunden' }, { status: 404 })

  let externerKalenderId: string | null = null

  // Create in external calendar if connected
  if (sv.kalender_sync_aktiv && sv.kalender_typ === 'google' && sv.google_calendar_token) {
    externerKalenderId = await createGoogleCalendarEvent(
      sv.google_calendar_token,
      { start_zeit, end_zeit, titel, beschreibung },
    )
  } else if (sv.kalender_sync_aktiv && sv.kalender_typ === 'outlook' && sv.outlook_calendar_token) {
    externerKalenderId = await createOutlookCalendarEvent(
      sv.outlook_calendar_token,
      { start_zeit, end_zeit, titel, beschreibung },
    )
  }

  // Save in gutachter_termine
  const { data: termin, error } = await supabase
    .from('gutachter_termine')
    .insert({
      sv_id,
      fall_id,
      start_zeit,
      end_zeit,
      status: 'bestaetigt',
      externer_kalender_id: externerKalenderId,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ termin_id: termin.id, externer_kalender_id: externerKalenderId })
}

/**
 * Placeholder: Create event in Google Calendar.
 */
async function createGoogleCalendarEvent(
  _token: unknown,
  _event: { start_zeit: string; end_zeit: string; titel?: string; beschreibung?: string },
): Promise<string | null> {
  // TODO: Implement real Google Calendar API
  // POST https://www.googleapis.com/calendar/v3/calendars/primary/events
  // Returns the created event ID
  return `google-mock-${Date.now()}`
}

/**
 * Placeholder: Create event in Outlook Calendar.
 */
async function createOutlookCalendarEvent(
  _token: unknown,
  _event: { start_zeit: string; end_zeit: string; titel?: string; beschreibung?: string },
): Promise<string | null> {
  // TODO: Implement real Microsoft Graph API
  // POST https://graph.microsoft.com/v1.0/me/events
  return `outlook-mock-${Date.now()}`
}
