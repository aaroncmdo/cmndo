// AAR-698: Google-Calendar-Sync für admin_termine (Rückrufe + KB-Termine).
// Schreibt das Event im persönlichen Kalender des `zugewiesen_an`-Users.
// Fail-silent bei fehlendem Token / API-Fehler.

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { createAdminClient } from '@/lib/supabase/admin'

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

const TYP_LABEL: Record<string, string> = {
  rueckruf: 'Rückruf',
  kunde: 'Kundentermin',
  intern: 'Intern',
  kb_beratung: 'KB-Beratung',
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

  // Lead-Daten optional für mehr Kontext im Event
  let leadInfo = ''
  let leadTel = ''
  if (t.lead_id) {
    const { data: lead } = await db
      .from('leads')
      .select('vorname, nachname, telefon')
      .eq('id', t.lead_id)
      .maybeSingle()
    if (lead) {
      leadInfo = [lead.vorname, lead.nachname].filter(Boolean).join(' ')
      leadTel = lead.telefon ?? ''
    }
  }

  const typLabel = TYP_LABEL[t.typ] ?? t.typ
  const title = `Claimondo · ${typLabel}${t.titel && t.titel !== leadInfo ? ` · ${t.titel}` : leadInfo ? ` · ${leadInfo}` : ''}`

  const descLines = [
    t.beschreibung,
    leadInfo ? `Kunde: ${leadInfo}` : null,
    leadTel ? `Telefon: ${leadTel}` : null,
    t.notizen ? `Notiz: ${t.notizen}` : null,
    t.lead_id
      ? `Lead: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/dispatch/leads/${t.lead_id}`
      : null,
    t.fall_id
      ? `Fall: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/faelle/${t.fall_id}`
      : null,
  ].filter(Boolean) as string[]

  const startDate = new Date(t.start_zeit)
  const endDate = t.end_zeit ? new Date(t.end_zeit) : new Date(startDate.getTime() + 15 * 60 * 1000)

  const calendar = google.calendar({ version: 'v3', auth })

  try {
    if (t.google_event_id) {
      await calendar.events.update({
        calendarId: t.google_calendar_id ?? 'primary',
        eventId: t.google_event_id,
        sendUpdates: 'none',
        requestBody: {
          summary: title,
          description: descLines.join('\n'),
          start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Berlin' },
          end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Berlin' },
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
          description: descLines.join('\n'),
          start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Berlin' },
          end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Berlin' },
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
