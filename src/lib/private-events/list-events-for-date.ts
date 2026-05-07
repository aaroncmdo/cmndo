// AAR-872: Aggregator fuer Privat-Events des SV an einem bestimmten Datum.
// Vereinheitlicht Google-Calendar (primary) und CalDAV (sv_kalender_verbindungen)
// in einen `PrivateCalendarEvent`-Array. Wird vom „Stop hinzufuegen"-Sheet
// genutzt, damit der SV einen Privat-Termin als Tagesroute-Stop addet.
//
// Filter: Events die bereits zu einem `gutachter_termine` matchen, werden
// vom Caller separat ausgefiltert (titel + zeitfenster fuzzy-match) — der
// Aggregator selbst liefert beide Mengen ungefiltert.

import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { listCalendarEventsFull } from '@/lib/kalender/caldav/client'

export type PrivateCalendarEvent = {
  source: 'gcal' | 'caldav'
  /** Stable ID innerhalb der Source. GCal-Event-ID oder CalDAV-UID. */
  external_event_id: string
  titel: string | null
  start_zeit: string
  end_zeit: string | null
  /** Roher Adress-String aus dem Event — nicht geocodiert. */
  location: string | null
}

const CALDAV_TIMEOUT_MS = 8000

async function fetchGcalEvents(
  profileId: string,
  fromIso: string,
  toIso: string,
): Promise<PrivateCalendarEvent[]> {
  try {
    const auth = await getGoogleOAuthClientForUser(profileId)
    if (!auth) return []
    const calendar = google.calendar({ version: 'v3', auth })
    const r = await calendar.events.list({
      calendarId: 'primary',
      timeMin: fromIso,
      timeMax: toIso,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })
    return (r.data.items ?? [])
      .map<PrivateCalendarEvent | null>((e) => {
        const start = e.start?.dateTime ?? e.start?.date ?? null
        const end = e.end?.dateTime ?? e.end?.date ?? null
        if (!start || !e.id) return null
        return {
          source: 'gcal',
          external_event_id: e.id,
          titel: e.summary ?? null,
          start_zeit: start,
          end_zeit: end,
          location: e.location ?? null,
        }
      })
      .filter((x): x is PrivateCalendarEvent => x !== null)
  } catch (err) {
    console.warn('[private-events] GCal-Fetch fehlgeschlagen:', err instanceof Error ? err.message : err)
    return []
  }
}

async function fetchCaldavEvents(
  profileId: string,
  fromIso: string,
  toIso: string,
): Promise<PrivateCalendarEvent[]> {
  try {
    const db = createAdminClient()
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (!sv) return []
    const { data: verb } = await db
      .from('sv_kalender_verbindungen')
      .select('server_url, username, password_encrypted, calendar_url')
      .eq('sv_id', sv.id as string)
      .eq('provider', 'caldav')
      .maybeSingle()
    if (!verb) return []

    const password = decrypt(verb.password_encrypted as string)
    const events = await Promise.race([
      listCalendarEventsFull(
        {
          serverUrl: verb.server_url as string,
          username: verb.username as string,
          password,
        },
        (verb.calendar_url as string) ?? '',
        fromIso,
        toIso,
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('caldav-events-timeout')), CALDAV_TIMEOUT_MS),
      ),
    ])
    return events.map<PrivateCalendarEvent>((e) => ({
      source: 'caldav',
      external_event_id: e.uid,
      titel: e.summary,
      start_zeit: e.start,
      end_zeit: e.end,
      location: e.location,
    }))
  } catch (err) {
    console.warn('[private-events] CalDAV-Fetch fehlgeschlagen:', err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Liste aller privaten Events des SV an einem Tag, vereinheitlicht aus
 * GCal + CalDAV. Sortiert nach start_zeit. Fail-soft: Bei Provider-Fehler
 * bleibt die jeweils andere Quelle.
 *
 * @param profileId profiles.id (Auth-User-ID des SV)
 * @param datumIso  YYYY-MM-DD — wird intern zu [00:00, 24:00) Berlin-Lokal expandiert
 */
export async function listPrivateEventsForDate(
  profileId: string,
  datumIso: string,
): Promise<PrivateCalendarEvent[]> {
  const dayStart = new Date(`${datumIso}T00:00:00`)
  const dayEnd = new Date(`${datumIso}T23:59:59`)
  const fromIso = dayStart.toISOString()
  const toIso = dayEnd.toISOString()

  const [gcal, caldav] = await Promise.all([
    fetchGcalEvents(profileId, fromIso, toIso),
    fetchCaldavEvents(profileId, fromIso, toIso),
  ])
  const all = [...gcal, ...caldav]
  all.sort((a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime())
  return all
}
