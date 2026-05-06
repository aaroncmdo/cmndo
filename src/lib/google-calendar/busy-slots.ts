// AAR-google-cal-drift: Wochen-FreeBusy für SV-Kalender-View.
//
// Im Gegensatz zu checkSvFreeBusy (Punkt-Check ±60min beim Matching) liefert
// dieser Helper alle Busy-Slots in einem Zeitfenster, damit der SV-Kalender
// externe Termine als geblockte Slots visualisieren kann.
//
// 2026-05-06 (Kelvin Gall-Fix): erweitert auf CalDAV (Apple iCloud + Custom-
// Server). Vorher rief getSvBusySlots ausschliesslich Google an — SVs mit
// Apple-Calendar-Verbindung sahen ihre privaten Termine nicht im SV-
// Kalender, obwohl der Healthcheck-Cron die Verbindung gruen meldete.
// Beide Quellen werden jetzt parallel geladen, Resultate werden gemerged.

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { listCalendarEvents } from '@/lib/kalender/caldav/client'

export type BusySlot = { start: string; end: string }

const GOOGLE_TIMEOUT_MS = 4000
const CALDAV_TIMEOUT_MS = 8000

async function getGoogleBusy(
  svProfileId: string,
  fromIso: string,
  toIso: string,
): Promise<BusySlot[]> {
  const auth = await getGoogleOAuthClientForUser(svProfileId)
  if (!auth) return []

  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const result = await Promise.race([
      calendar.freebusy.query({
        requestBody: {
          timeMin: fromIso,
          timeMax: toIso,
          items: [{ id: 'primary' }],
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('busy-slots-timeout')), GOOGLE_TIMEOUT_MS),
      ),
    ])
    const busy = result.data.calendars?.primary?.busy ?? []
    return busy
      .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
      .map((b) => ({ start: b.start, end: b.end }))
  } catch (err) {
    console.warn(
      '[busy-slots] Google-FreeBusy fuer',
      svProfileId,
      'fehlgeschlagen:',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

async function getCaldavBusy(
  svProfileId: string,
  fromIso: string,
  toIso: string,
): Promise<BusySlot[]> {
  try {
    const db = createAdminClient()
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', svProfileId)
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
      listCalendarEvents(
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
        setTimeout(() => reject(new Error('caldav-busy-timeout')), CALDAV_TIMEOUT_MS),
      ),
    ])
    return events.map((e) => ({ start: e.start, end: e.end }))
  } catch (err) {
    console.warn(
      '[busy-slots] CalDAV-Events fuer',
      svProfileId,
      'fehlgeschlagen:',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

export async function getSvBusySlots(
  svProfileId: string,
  fromIso: string,
  toIso: string,
): Promise<BusySlot[]> {
  // Beide Quellen parallel — fail-open: bei Provider-Fehler bleibt die
  // jeweils andere Quelle, der SV-Kalender stuerzt nicht ab.
  const [googleSlots, caldavSlots] = await Promise.all([
    getGoogleBusy(svProfileId, fromIso, toIso),
    getCaldavBusy(svProfileId, fromIso, toIso),
  ])
  return [...googleSlots, ...caldavSlots]
}
