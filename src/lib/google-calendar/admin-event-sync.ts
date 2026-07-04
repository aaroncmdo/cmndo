// AAR-698: Google-Calendar-Sync für admin_termine (Rückrufe + KB-Termine).
// Schreibt das Event im persönlichen Kalender des `zugewiesen_an`-Users.
// Fail-silent bei fehlendem Token / API-Fehler.
//
// SP2d: Titel/Beschreibung/Zeiten kommen jetzt aus dem geteilten buildAdminEventContent
// (auch vom CalDAV-Zweig genutzt). Zusaetzlich wird der CalDAV-Sync fail-soft mitgetriggert
// -> jede Call-Site bekommt Google + CalDAV, ohne die Call-Sites zu aendern.

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { createAdminClient } from '@/lib/supabase/admin'
// AAR-956 TZ-Fix: Google-Payload braucht Berlin-Wall-Clock (ohne Offset) statt
// UTC-toISOString() + timeZone — sonst 2h-Sommer-Versatz (siehe timezone.ts).
import { toBerlinWallClock, GOOGLE_CALENDAR_TIMEZONE } from '@/lib/google-calendar/timezone'
import { buildAdminEventContent } from '@/lib/kalender/admin-event-content'

type AdminTerminShape = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  start_zeit: string
  end_zeit: string | null
  notizen: string | null
  status: string | null
  zugewiesen_an: string | null
  lead_id: string | null
  fall_id: string | null
  google_event_id: string | null
  google_calendar_id: string | null
}

export async function syncAdminTerminCalendarEvent(terminId: string): Promise<void> {
  const db = createAdminClient()
  const { data: termin } = await db
    .from('admin_termine')
    .select(
      'id, typ, titel, beschreibung, start_zeit, end_zeit, notizen, status, zugewiesen_an, lead_id, fall_id, google_event_id, google_calendar_id',
    )
    .eq('id', terminId)
    .maybeSingle()

  if (!termin) return
  const t = termin as unknown as AdminTerminShape

  // SP2d: CalDAV parallel (eigenes Modul, owner-gated + fail-soft, laeuft auch bei delete/skip).
  await import('@/lib/kalender/caldav/admin-event-sync')
    .then((m) => m.syncAdminTerminToCalDav(terminId))
    .catch(() => {})

  const shouldDelete =
    t.status === 'erledigt' || t.status === 'abgesagt' || t.status === 'storniert'
  const shouldUpsert = !shouldDelete && t.status === 'offen' && !!t.zugewiesen_an

  if (shouldDelete && t.google_event_id && t.zugewiesen_an) {
    await deleteEvent(t.zugewiesen_an, t.google_event_id, t.google_calendar_id ?? 'primary').catch(
      (err) => console.warn('[admin-event-sync] delete:', err instanceof Error ? err.message : err),
    )
    await db
      .from('admin_termine')
      .update({
        google_event_id: null,
        google_calendar_id: null,
        google_event_synced_at: new Date().toISOString(),
      })
      .eq('id', terminId)
    return
  }

  if (!shouldUpsert || !t.zugewiesen_an) return

  const auth = await getGoogleOAuthClientForUser(t.zugewiesen_an)
  if (!auth) return // Fail-silent: User hat keinen Google-Token

  const { title, description, startIso, endIso } = await buildAdminEventContent(t, db)

  const calendar = google.calendar({ version: 'v3', auth })

  try {
    if (t.google_event_id) {
      await calendar.events.update({
        calendarId: t.google_calendar_id ?? 'primary',
        eventId: t.google_event_id,
        sendUpdates: 'none',
        requestBody: {
          summary: title,
          description,
          start: { dateTime: toBerlinWallClock(startIso), timeZone: GOOGLE_CALENDAR_TIMEZONE },
          end: { dateTime: toBerlinWallClock(endIso), timeZone: GOOGLE_CALENDAR_TIMEZONE },
        },
      })
      await db
        .from('admin_termine')
        .update({ google_event_synced_at: new Date().toISOString() })
        .eq('id', terminId)
    } else {
      const res = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'none',
        requestBody: {
          summary: title,
          description,
          start: { dateTime: toBerlinWallClock(startIso), timeZone: GOOGLE_CALENDAR_TIMEZONE },
          end: { dateTime: toBerlinWallClock(endIso), timeZone: GOOGLE_CALENDAR_TIMEZONE },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'popup', minutes: 5 },
            ],
          },
        },
      })
      if (res.data.id) {
        await db
          .from('admin_termine')
          .update({
            google_event_id: res.data.id,
            google_calendar_id: 'primary',
            google_event_synced_at: new Date().toISOString(),
          })
          .eq('id', terminId)
      }
    }
  } catch (err) {
    console.warn(
      '[admin-event-sync] insert/update für Termin',
      terminId,
      'fehlgeschlagen:',
      err instanceof Error ? err.message : err,
    )
  }
}

async function deleteEvent(userId: string, eventId: string, calendarId: string) {
  const auth = await getGoogleOAuthClientForUser(userId)
  if (!auth) return
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' })
}
