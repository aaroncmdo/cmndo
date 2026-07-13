// SP2d: CalDAV-Sync fuer admin_termine (Rueckrufe). Spiegelt google-calendar/admin-event-sync,
// keyed auf zugewiesen_an -> dessen kalender_verbindungen-CalDAV-Verbindung. Owner-gated, fail-soft.
// Nutzt die CalDAV-Client-Primitiven wie der caldavProvider (gutachter_termine).

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/kalender/caldav/client'
import { buildAdminEventContent, type AdminEventInput } from '@/lib/kalender/admin-event-content'

type Row = AdminEventInput & {
  id: string
  status: string | null
  zugewiesen_an: string | null
  caldav_object_url: string | null
  caldav_event_uid: string | null
}

export async function syncAdminTerminToCalDav(terminId: string): Promise<void> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('admin_termine')
      .select(
        'id, typ, titel, beschreibung, notizen, start_zeit, end_zeit, status, zugewiesen_an, lead_id, fall_id, caldav_object_url, caldav_event_uid',
      )
      .eq('id', terminId)
      .maybeSingle()
    if (!data) return
    const t = data as unknown as Row
    if (!t.zugewiesen_an) return // Pool-Rueckruf ohne Owner -> skip (wie Google)

    const shouldDelete = t.status === 'erledigt' || t.status === 'abgesagt' || t.status === 'storniert'
    const shouldUpsert = !shouldDelete && t.status === 'offen'

    const { data: conn } = await db
      .from('kalender_verbindungen')
      .select('server_url, username, password_encrypted, calendar_url')
      .eq('profile_id', t.zugewiesen_an)
      .eq('provider', 'caldav')
      .maybeSingle()

    if (shouldDelete) {
      if (t.caldav_object_url && conn) {
        const password = decrypt(conn.password_encrypted as string)
        await deleteCalendarEvent({
          creds: { serverUrl: conn.server_url as string, username: conn.username as string, password },
          objectUrl: t.caldav_object_url,
        }).catch((err) => console.warn('[admin-caldav] delete:', err instanceof Error ? err.message : err))
      }
      if (t.caldav_object_url) {
        await db
          .from('admin_termine')
          .update({ caldav_object_url: null, caldav_event_uid: null, caldav_synced_at: new Date().toISOString() })
          .eq('id', terminId)
      }
      return
    }
    if (!shouldUpsert || !conn || !conn.calendar_url) return

    const password = decrypt(conn.password_encrypted as string)
    const creds = { serverUrl: conn.server_url as string, username: conn.username as string, password }
    const { title, description, startIso, endIso } = await buildAdminEventContent(t, db)

    if (t.caldav_object_url && t.caldav_event_uid) {
      await updateCalendarEvent({
        creds,
        objectUrl: t.caldav_object_url,
        event: { uid: t.caldav_event_uid, summary: title, description, startIso, endIso },
      })
      await db.from('admin_termine').update({ caldav_synced_at: new Date().toISOString() }).eq('id', terminId)
    } else {
      const result = await createCalendarEvent({
        creds,
        calendarUrl: conn.calendar_url as string,
        event: { summary: title, description, startIso, endIso },
      })
      await db
        .from('admin_termine')
        .update({
          caldav_object_url: result.objectUrl,
          caldav_event_uid: result.uid,
          caldav_synced_at: new Date().toISOString(),
        })
        .eq('id', terminId)
    }
  } catch (err) {
    console.warn('[admin-caldav] sync fuer', terminId, 'fehlgeschlagen:', err instanceof Error ? err.message : err)
  }
}
