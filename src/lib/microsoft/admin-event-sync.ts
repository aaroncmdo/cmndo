// SP5d: Outlook-Sync fuer admin_termine (Rueckrufe). Spiegelt kalender/caldav/admin-event-sync,
// keyed auf zugewiesen_an -> getMicrosoftAccessTokenForUser (env-gated -> skip ohne Token/dormant).
// Graph /me/events. Owner-gated, shouldDelete/shouldUpsert wie Google/CalDAV, fail-soft.
import { createAdminClient } from '@/lib/supabase/admin'
import { getMicrosoftAccessTokenForUser } from '@/lib/microsoft/graph-client'
import { GOOGLE_CALENDAR_TIMEZONE, toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { buildAdminEventContent, type AdminEventInput } from '@/lib/kalender/admin-event-content'

type Row = AdminEventInput & {
  id: string
  status: string | null
  zugewiesen_an: string | null
  ms_event_id: string | null
}

export async function syncAdminTerminToOutlook(terminId: string): Promise<void> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('admin_termine')
      .select('id, typ, titel, beschreibung, notizen, start_zeit, end_zeit, status, zugewiesen_an, lead_id, fall_id, ms_event_id')
      .eq('id', terminId)
      .maybeSingle()
    if (!data) return
    const t = data as unknown as Row
    if (!t.zugewiesen_an) return // Pool-Rueckruf ohne Owner -> skip

    const token = await getMicrosoftAccessTokenForUser(t.zugewiesen_an)
    if (!token) return // kein MS-Token / dormant -> skip

    const shouldDelete = t.status === 'erledigt' || t.status === 'abgesagt' || t.status === 'storniert'
    const shouldUpsert = !shouldDelete && t.status === 'offen'

    if (shouldDelete) {
      if (t.ms_event_id) {
        await fetch(`https://graph.microsoft.com/v1.0/me/events/${t.ms_event_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => console.warn('[admin-outlook] delete:', err instanceof Error ? err.message : err))
        await db.from('admin_termine').update({ ms_event_id: null }).eq('id', terminId)
      }
      return
    }
    if (!shouldUpsert) return

    const { title, description, startIso, endIso } = await buildAdminEventContent(t, db)
    const eventBody = {
      subject: title,
      body: { contentType: 'text', content: description },
      start: { dateTime: toBerlinWallClock(startIso), timeZone: GOOGLE_CALENDAR_TIMEZONE },
      end: { dateTime: toBerlinWallClock(endIso), timeZone: GOOGLE_CALENDAR_TIMEZONE },
    }

    if (t.ms_event_id) {
      await fetch(`https://graph.microsoft.com/v1.0/me/events/${t.ms_event_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      })
    } else {
      const resp = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      })
      if (resp.ok) {
        const created = (await resp.json()) as { id?: string }
        if (created.id) {
          await db.from('admin_termine').update({ ms_event_id: created.id }).eq('id', terminId)
        }
      }
    }
  } catch (err) {
    console.warn('[admin-outlook] sync fuer', terminId, 'fehlgeschlagen:', err instanceof Error ? err.message : err)
  }
}
