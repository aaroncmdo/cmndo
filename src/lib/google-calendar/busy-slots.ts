// AAR-google-cal-drift: Wochen-FreeBusy für SV-Kalender-View.
//
// Im Gegensatz zu checkSvFreeBusy (Punkt-Check ±60min beim Matching) liefert
// dieser Helper alle Busy-Slots in einem Zeitfenster, damit der SV-Kalender
// externe Termine als geblockte Slots visualisieren kann.

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'

export type BusySlot = { start: string; end: string }

const TIMEOUT_MS = 4000

export async function getSvBusySlots(
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
        setTimeout(() => reject(new Error('busy-slots-timeout')), TIMEOUT_MS),
      ),
    ])
    const busy = result.data.calendars?.primary?.busy ?? []
    return busy
      .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
      .map((b) => ({ start: b.start, end: b.end }))
  } catch (err) {
    console.warn(
      '[busy-slots] FreeBusy für',
      svProfileId,
      'fehlgeschlagen:',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}
