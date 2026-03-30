import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/kalender-sync
 * Syncs external calendar (Google/Outlook) for a given SV.
 * Reads all events and writes them as blocked times in gutachter_termine.
 * Called periodically or on-demand.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const svId = body.sv_id as string | undefined

  // If svId provided, sync specific SV. Otherwise sync all active.
  let svs: { id: string; kalender_typ: string; google_calendar_token: unknown; outlook_calendar_token: unknown }[] = []

  if (svId) {
    const { data } = await supabase
      .from('sachverstaendige')
      .select('id, kalender_typ, google_calendar_token, outlook_calendar_token')
      .eq('id', svId)
      .eq('kalender_sync_aktiv', true)
    svs = data ?? []
  } else {
    const { data } = await supabase
      .from('sachverstaendige')
      .select('id, kalender_typ, google_calendar_token, outlook_calendar_token')
      .eq('kalender_sync_aktiv', true)
    svs = data ?? []
  }

  const results: { sv_id: string; synced: number; error?: string }[] = []

  for (const sv of svs) {
    try {
      let events: { start: string; end: string; title?: string; externer_id?: string }[] = []

      if (sv.kalender_typ === 'google' && sv.google_calendar_token) {
        events = await fetchGoogleCalendarEvents(sv.google_calendar_token)
      } else if (sv.kalender_typ === 'outlook' && sv.outlook_calendar_token) {
        events = await fetchOutlookCalendarEvents(sv.outlook_calendar_token)
      }

      // Write blocked times (private events without fall_id)
      if (events.length > 0) {
        // Remove old external entries for this SV (upcoming only)
        await supabase
          .from('gutachter_termine')
          .delete()
          .eq('sv_id', sv.id)
          .is('fall_id', null)
          .gte('start_zeit', new Date().toISOString())

        const rows = events.map(e => ({
          sv_id: sv.id,
          fall_id: null,
          start_zeit: e.start,
          end_zeit: e.end,
          status: 'bestaetigt' as const,
          externer_kalender_id: e.externer_id ?? null,
        }))

        await supabase.from('gutachter_termine').insert(rows)
      }

      // Update sync timestamp
      await supabase
        .from('sachverstaendige')
        .update({ kalender_sync_letzte: new Date().toISOString() })
        .eq('id', sv.id)

      results.push({ sv_id: sv.id, synced: events.length })
    } catch (err) {
      results.push({ sv_id: sv.id, synced: 0, error: err instanceof Error ? err.message : 'Fehler' })
    }
  }

  return NextResponse.json({ results })
}

/**
 * Placeholder: Fetch events from Google Calendar API.
 * Will be replaced with real Google Calendar API calls once OAuth is set up.
 */
async function fetchGoogleCalendarEvents(
  _token: unknown,
): Promise<{ start: string; end: string; title?: string; externer_id?: string }[]> {
  // TODO: Implement real Google Calendar API integration
  // Uses token.access_token to call:
  // GET https://www.googleapis.com/calendar/v3/calendars/primary/events
  //   ?timeMin=<now>&timeMax=<+30days>&singleEvents=true
  // For now, return empty (no mock data to avoid confusion)
  return []
}

/**
 * Placeholder: Fetch events from Outlook/Microsoft Graph API.
 */
async function fetchOutlookCalendarEvents(
  _token: unknown,
): Promise<{ start: string; end: string; title?: string; externer_id?: string }[]> {
  // TODO: Implement real Microsoft Graph API integration
  // Uses token.access_token to call:
  // GET https://graph.microsoft.com/v1.0/me/calendarView
  //   ?startDateTime=<now>&endDateTime=<+30days>
  return []
}
