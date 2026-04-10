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
  const user = (await supabase.auth.getUser())?.data?.user ?? null
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

// Google Calendar API: Termine der naechsten 30 Tage lesen.
async function fetchGoogleCalendarEvents(
  token: unknown,
): Promise<{ start: string; end: string; title?: string; externer_id?: string }[]> {
  const tokenObj = token as { access_token?: string } | string | null
  const accessToken = typeof tokenObj === 'string' ? tokenObj : tokenObj?.access_token
  if (!accessToken) return []
  const now = new Date()
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', now.toISOString())
  url.searchParams.set('timeMax', in30d.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '100')
  try {
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) return []
    const data = await resp.json()
    return (data.items ?? [])
      .filter((e: { start?: { dateTime?: string }; end?: { dateTime?: string } }) => e.start?.dateTime && e.end?.dateTime)
      .map((e: { id: string; summary?: string; start: { dateTime: string }; end: { dateTime: string } }) => ({
        start: e.start.dateTime, end: e.end.dateTime, title: e.summary, externer_id: e.id,
      }))
  } catch { return [] }
}

// Microsoft Graph API: Outlook Kalender-Termine lesen.
async function fetchOutlookCalendarEvents(
  token: unknown,
): Promise<{ start: string; end: string; title?: string; externer_id?: string }[]> {
  const tokenObj = token as { access_token?: string } | string | null
  const accessToken = typeof tokenObj === 'string' ? tokenObj : tokenObj?.access_token
  if (!accessToken) return []
  const now = new Date()
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView')
  url.searchParams.set('startDateTime', now.toISOString())
  url.searchParams.set('endDateTime', in30d.toISOString())
  url.searchParams.set('$top', '100')
  url.searchParams.set('$orderby', 'start/dateTime')
  try {
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) return []
    const data = await resp.json()
    return (data.value ?? [])
      .filter((e: { start?: { dateTime?: string }; end?: { dateTime?: string } }) => e.start?.dateTime && e.end?.dateTime)
      .map((e: { id: string; subject?: string; start: { dateTime: string }; end: { dateTime: string } }) => ({
        start: e.start.dateTime, end: e.end.dateTime, title: e.subject, externer_id: e.id,
      }))
  } catch { return [] }
}
