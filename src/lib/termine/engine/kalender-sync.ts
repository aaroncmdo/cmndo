// P2.5 — syncTerminToExternalCalendar: assignee-generische externe-Kalender-Sync-Op.
// Generalisiert die zwei SV-/fall-gekoppelten sv-termin-sync (Google + CalDAV) zu einer
// Engine-Op ueber ein KalenderProvider-Interface. SV-only konkret (andere assignee-Typen
// → 'skip'). fail-soft je Provider (non-critical Sub-Op). NICHT verdrahtet (Phase-3-Repoint).
// Die alten sv-termin-sync.ts bleiben bis dahin (kein Doppel-Send).
import type { SupabaseClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { GOOGLE_CALENDAR_TIMEZONE, toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/kalender/caldav/client'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { resolveTerminKontext, type TerminKontext } from './kalender-kontext'

export type SyncStatus = 'created' | 'updated' | 'skip' | 'error'

export interface TerminSyncRow {
  id: string
  assignee_typ: string | null
  assignee_id: string | null
  start_zeit: string
  end_zeit: string
  status: string
  bezug_typ: string | null
  bezug_id: string | null
  besichtigungsort_adresse: string | null
  google_event_id: string | null
  google_calendar_id: string | null
  caldav_object_url: string | null
  caldav_event_uid: string | null
}

export interface KalenderProvider {
  name: string
  upsert(termin: TerminSyncRow, kontext: TerminKontext, db: SupabaseClient): Promise<SyncStatus>
  remove(termin: TerminSyncRow, db: SupabaseClient): Promise<SyncStatus>
}

export interface SyncResult {
  ok: boolean
  results: Record<string, SyncStatus>
  error?: string
}

const SYNC_SELECT =
  'id, assignee_typ, assignee_id, start_zeit, end_zeit, status, bezug_typ, bezug_id, ' +
  'besichtigungsort_adresse, google_event_id, google_calendar_id, caldav_object_url, caldav_event_uid'
const AKTIV_STATUS = ['reserviert', 'bestaetigt', 'verlegung_pending']

async function svProfileId(db: SupabaseClient, svId: string): Promise<string | null> {
  const { data } = await db.from('sachverstaendige').select('profile_id').eq('id', svId).maybeSingle()
  return (data?.profile_id as string | null) ?? null
}

// ─── Google ──────────────────────────────────────────────────────────────
export const googleProvider: KalenderProvider = {
  name: 'google',
  async upsert(termin, kontext, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id) return 'skip'
    const profileId = await svProfileId(db, termin.assignee_id)
    if (!profileId) return 'skip'
    const auth = await getGoogleOAuthClientForUser(profileId)
    if (!auth) return 'skip'
    const calendar = google.calendar({ version: 'v3', auth })
    const eventBody = {
      summary: kontext.summary,
      description: kontext.description,
      location: kontext.location,
      start: { dateTime: toBerlinWallClock(termin.start_zeit), timeZone: GOOGLE_CALENDAR_TIMEZONE },
      end: { dateTime: toBerlinWallClock(termin.end_zeit), timeZone: GOOGLE_CALENDAR_TIMEZONE },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 15 }] },
    }
    if (termin.google_event_id) {
      await calendar.events.update({ calendarId: termin.google_calendar_id ?? 'primary', eventId: termin.google_event_id, requestBody: eventBody })
      return 'updated'
    }
    const resp = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody })
    const eventId = resp.data.id
    if (eventId) {
      await db.from('gutachter_termine').update({ google_event_id: eventId, google_calendar_id: 'primary' }).eq('id', termin.id)
    }
    return 'created'
  },
  async remove(termin, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id || !termin.google_event_id) return 'skip'
    const profileId = await svProfileId(db, termin.assignee_id)
    if (!profileId) return 'skip'
    const auth = await getGoogleOAuthClientForUser(profileId)
    if (!auth) return 'skip'
    const calendar = google.calendar({ version: 'v3', auth })
    try {
      await calendar.events.delete({ calendarId: termin.google_calendar_id ?? 'primary', eventId: termin.google_event_id })
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      if (!/404|not.?found/i.test(m)) throw err
    }
    await db.from('gutachter_termine').update({ google_event_id: null, google_calendar_id: null }).eq('id', termin.id)
    return 'updated'
  },
}

// ─── CalDAV ──────────────────────────────────────────────────────────────
type CalDavConn = { server_url: string; username: string; password_encrypted: string; calendar_url: string | null }

async function caldavConn(db: SupabaseClient, svId: string): Promise<CalDavConn | null> {
  const { data } = await db
    .from('sv_kalender_verbindungen')
    .select('server_url, username, password_encrypted, calendar_url')
    .eq('sv_id', svId)
    .eq('provider', 'caldav')
    .maybeSingle()
  if (!data || !data.calendar_url) return null
  return data as CalDavConn
}

export const caldavProvider: KalenderProvider = {
  name: 'caldav',
  async upsert(termin, kontext, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id) return 'skip'
    const conn = await caldavConn(db, termin.assignee_id)
    if (!conn || !conn.calendar_url) return 'skip'
    const password = decrypt(conn.password_encrypted)
    const creds = { serverUrl: conn.server_url, username: conn.username, password }
    if (termin.caldav_object_url && termin.caldav_event_uid) {
      await updateCalendarEvent({
        creds,
        objectUrl: termin.caldav_object_url,
        event: { uid: termin.caldav_event_uid, summary: kontext.summary, description: kontext.description, location: kontext.location, startIso: termin.start_zeit, endIso: termin.end_zeit },
      })
      await db.from('gutachter_termine').update({ caldav_synced_at: new Date().toISOString() }).eq('id', termin.id)
      return 'updated'
    }
    const result = await createCalendarEvent({
      creds,
      calendarUrl: conn.calendar_url,
      event: { summary: kontext.summary, description: kontext.description, location: kontext.location, startIso: termin.start_zeit, endIso: termin.end_zeit },
    })
    await db.from('gutachter_termine').update({ caldav_object_url: result.objectUrl, caldav_event_uid: result.uid, caldav_synced_at: new Date().toISOString() }).eq('id', termin.id)
    return 'created'
  },
  async remove(termin, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id || !termin.caldav_object_url) return 'skip'
    const conn = await caldavConn(db, termin.assignee_id)
    if (!conn) return 'skip'
    const password = decrypt(conn.password_encrypted)
    await deleteCalendarEvent({ creds: { serverUrl: conn.server_url, username: conn.username, password }, objectUrl: termin.caldav_object_url })
    await db.from('gutachter_termine').update({ caldav_object_url: null, caldav_event_uid: null, caldav_synced_at: null }).eq('id', termin.id)
    return 'updated'
  },
}

const DEFAULT_PROVIDERS: KalenderProvider[] = [googleProvider, caldavProvider]

async function ladeTermin(db: SupabaseClient, terminId: string): Promise<TerminSyncRow | null> {
  const { data } = await db.from('gutachter_termine').select(SYNC_SELECT).eq('id', terminId).maybeSingle()
  return (data as unknown as TerminSyncRow | null) ?? null
}

function alleSkip(providers: KalenderProvider[]): Record<string, SyncStatus> {
  return Object.fromEntries(providers.map((p) => [p.name, 'skip' as SyncStatus]))
}

/**
 * Schreibt/aktualisiert die Buchung in die verbundenen Kalender des Assignees
 * (idempotent via gespeicherte Refs). SV-only; nicht-aktiver Status → skip
 * (Entfernen via entferneTerminAusExternemKalender). fail-soft je Provider.
 */
export async function syncTerminToExternalCalendar(
  terminId: string,
  opts?: { db?: SupabaseClient; providers?: KalenderProvider[] },
): Promise<SyncResult> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const providers = opts?.providers ?? DEFAULT_PROVIDERS
  const termin = await ladeTermin(db, terminId)
  if (!termin) return { ok: false, results: {}, error: 'Termin nicht gefunden' }
  if (termin.assignee_typ !== 'sachverstaendiger') return { ok: true, results: alleSkip(providers) }
  if (!AKTIV_STATUS.includes(termin.status)) return { ok: true, results: alleSkip(providers) }

  const kontext = await resolveTerminKontext(termin, db)
  const results: Record<string, SyncStatus> = {}
  for (const p of providers) {
    try {
      results[p.name] = await p.upsert(termin, kontext, db)
    } catch (err) {
      results[p.name] = 'error'
      console.error(`[kalender-sync] ${p.name} upsert fehlgeschlagen fuer Termin ${terminId}:`, err instanceof Error ? err.message : err)
    }
  }
  return { ok: true, results }
}

/** Entfernt die Buchung aus den verbundenen Kalendern (Storno/Ablehnung/Verlegung). fail-soft. */
export async function entferneTerminAusExternemKalender(
  terminId: string,
  opts?: { db?: SupabaseClient; providers?: KalenderProvider[] },
): Promise<SyncResult> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const providers = opts?.providers ?? DEFAULT_PROVIDERS
  const termin = await ladeTermin(db, terminId)
  if (!termin) return { ok: false, results: {}, error: 'Termin nicht gefunden' }
  const results: Record<string, SyncStatus> = {}
  for (const p of providers) {
    try {
      results[p.name] = await p.remove(termin, db)
    } catch (err) {
      results[p.name] = 'error'
      console.error(`[kalender-sync] ${p.name} remove fehlgeschlagen fuer Termin ${terminId}:`, err instanceof Error ? err.message : err)
    }
  }
  return { ok: true, results }
}
