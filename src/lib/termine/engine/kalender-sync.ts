// syncTerminToExternalCalendar: assignee-generische externe-Kalender-Sync-Op (Google + CalDAV)
// ueber ein KalenderProvider-Interface. SP1 (2026-07): assignee-generisch via resolveAssigneeProfileId
// → jeder assignee_typ, der auf ein Profil mit Verbindung aufloest (SV, kundenbetreuer, …). Google
// via profiles.google_*, CalDAV via kalender_verbindungen. fail-soft je Provider (non-critical Sub-Op).
import type { SupabaseClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { GOOGLE_CALENDAR_TIMEZONE, toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { CalDavError, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/kalender/caldav/client'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { resolveTerminKontext, type TerminKontext } from './kalender-kontext'
import { resolveAssigneeProfileId } from './assignee-profile'
import { getMicrosoftAccessTokenForUser } from '@/lib/microsoft/graph-client'

export type SyncStatus = 'created' | 'updated' | 'skip' | 'error'

export interface TerminSyncRow {
  id: string
  assignee_typ: string | null
  assignee_id: string | null
  start_zeit: string
  end_zeit: string
  status: string
  typ: string | null
  bezug_typ: string | null
  bezug_id: string | null
  claim_id: string | null
  lead_id: string | null
  besichtigungsort_adresse: string | null
  google_event_id: string | null
  google_calendar_id: string | null
  caldav_object_url: string | null
  caldav_event_uid: string | null
  ms_event_id: string | null
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
  'id, assignee_typ, assignee_id, start_zeit, end_zeit, status, typ, bezug_typ, bezug_id, claim_id, lead_id, ' +
  'besichtigungsort_adresse, google_event_id, google_calendar_id, caldav_object_url, caldav_event_uid, ms_event_id'
const AKTIV_STATUS = ['reserviert', 'bestaetigt', 'verlegung_pending']

// ─── Google ──────────────────────────────────────────────────────────────
export const googleProvider: KalenderProvider = {
  name: 'google',
  async upsert(termin, kontext, db) {
    const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id)
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
      // Idempotenz-Anker: das Event steht bereits im Kalender. Bleibt die Id ungespeichert,
      // kennt die DB es nicht — der naechste Sync legt ein ZWEITES an (Duplikat beim Assignee).
      const { error: ankerFehler } = await db
        .from('gutachter_termine')
        .update({ google_event_id: eventId, google_calendar_id: 'primary' })
        .eq('id', termin.id)
      if (ankerFehler) {
        throw new Error(
          `Event angelegt (${eventId}), aber google_event_id nicht gespeichert — naechster Sync erzeugt ein Duplikat: ${ankerFehler.message}`,
        )
      }
    }
    return 'created'
  },
  async remove(termin, db) {
    if (!termin.google_event_id) return 'skip'
    const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id)
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
    // Referenz loesen. Bleibt sie stehen, zeigt sie auf ein geloeschtes Event —
    // jeder weitere Sync laeuft in events.update -> 404.
    const { error: refFehler } = await db
      .from('gutachter_termine')
      .update({ google_event_id: null, google_calendar_id: null })
      .eq('id', termin.id)
    if (refFehler) {
      throw new Error(`Event geloescht, aber google_event_id nicht zurueckgesetzt: ${refFehler.message}`)
    }
    return 'updated'
  },
}

// ─── CalDAV ──────────────────────────────────────────────────────────────
type CalDavConn = { server_url: string; username: string; password_encrypted: string; calendar_url: string | null }

async function caldavConn(db: SupabaseClient, profileId: string): Promise<CalDavConn | null> {
  // Universelle SSoT: kalender_verbindungen (profile_id). Der Connect-Write-Pfad
  // (lib/kalender/connect/caldav-connect-actions.ts) schreibt ebenfalls hierher —
  // damit ist die staging-Interimsnotiz "kalender_verbindungen war nur Backfill" obsolet
  // (Read+Write jetzt konsistent auf profile_id; prod-Daten gespiegelt, verifiziert).
  const { data } = await db
    .from('kalender_verbindungen')
    .select('server_url, username, password_encrypted, calendar_url')
    .eq('profile_id', profileId)
    .eq('provider', 'caldav')
    .maybeSingle()
  if (!data || !data.calendar_url) return null
  return data as CalDavConn
}

export const caldavProvider: KalenderProvider = {
  name: 'caldav',
  async upsert(termin, kontext, db) {
    const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id)
    if (!profileId) return 'skip'
    const conn = await caldavConn(db, profileId)
    if (!conn || !conn.calendar_url) return 'skip'
    const password = decrypt(conn.password_encrypted)
    const creds = { serverUrl: conn.server_url, username: conn.username, password }
    try {
      if (termin.caldav_object_url && termin.caldav_event_uid) {
        await updateCalendarEvent({
          creds,
          objectUrl: termin.caldav_object_url,
          event: { uid: termin.caldav_event_uid, summary: kontext.summary, description: kontext.description, location: kontext.location, startIso: termin.start_zeit, endIso: termin.end_zeit },
        })
        // Nur der Sync-Zeitstempel — ohne Folgeschaden, daher kein throw (anders als beim Anker unten).
        const { error: stempelFehler } = await db
          .from('gutachter_termine')
          .update({ caldav_synced_at: new Date().toISOString() })
          .eq('id', termin.id)
        if (stempelFehler) {
          console.error(`[kalender-sync] caldav_synced_at nicht gesetzt (${termin.id}):`, stempelFehler.message)
        }
        return 'updated'
      }
      const result = await createCalendarEvent({
        creds,
        calendarUrl: conn.calendar_url,
        event: { summary: kontext.summary, description: kontext.description, location: kontext.location, startIso: termin.start_zeit, endIso: termin.end_zeit },
      })
      // Idempotenz-Anker (wie google_event_id): ohne objectUrl/uid findet der naechste
      // Sync das Event nicht wieder und legt ein ZWEITES an.
      const { error: ankerFehler } = await db
        .from('gutachter_termine')
        .update({ caldav_object_url: result.objectUrl, caldav_event_uid: result.uid, caldav_synced_at: new Date().toISOString() })
        .eq('id', termin.id)
      if (ankerFehler) {
        throw new Error(
          `CalDAV-Event angelegt (${result.uid}), aber Referenz nicht gespeichert — naechster Sync erzeugt ein Duplikat: ${ankerFehler.message}`,
        )
      }
      return 'created'
    } catch (err) {
      // Parity mit dem alten caldav/sv-termin-sync: bei auth_failed die Verbindung
      // markieren, damit der SV im Profil "App-Passwort pruefen" sieht. Danach
      // rethrow → der aeussere Sync-Loop loggt + setzt results['caldav']='error'.
      if (err instanceof CalDavError && err.code === 'auth_failed') {
        await db
          .from('kalender_verbindungen')
          .update({ last_error: 'Login fehlgeschlagen — App-Passwort prüfen', last_error_at: new Date().toISOString() })
          .eq('profile_id', profileId)
          .eq('provider', 'caldav')
      }
      throw err
    }
  },
  async remove(termin, db) {
    if (!termin.caldav_object_url) return 'skip'
    const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id)
    if (!profileId) return 'skip'
    const conn = await caldavConn(db, profileId)
    if (!conn) return 'skip'
    const password = decrypt(conn.password_encrypted)
    await deleteCalendarEvent({ creds: { serverUrl: conn.server_url, username: conn.username, password }, objectUrl: termin.caldav_object_url })
    // Referenz loesen — bleibt sie stehen, zeigt sie auf ein geloeschtes Event.
    const { error: refFehler } = await db
      .from('gutachter_termine')
      .update({ caldav_object_url: null, caldav_event_uid: null, caldav_synced_at: null })
      .eq('id', termin.id)
    if (refFehler) {
      throw new Error(`CalDAV-Event geloescht, aber Referenz nicht zurueckgesetzt: ${refFehler.message}`)
    }
    return 'updated'
  },
}

// ─── Microsoft Outlook (Graph) ───────────────────────────────────────────────
// SP5b: Mirror von googleProvider, raw fetch gegen Graph /me/events. Env-gated ueber
// getMicrosoftAccessTokenForUser (kein MS-Token -> skip; dormant bis Azure). ms_event_id =
// Idempotenz-Anker (wie google_event_id). Non-OK -> throw (Orchestrator faengt per-Provider).
export const outlookProvider: KalenderProvider = {
  name: 'outlook',
  async upsert(termin, kontext, db) {
    const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id)
    if (!profileId) return 'skip'
    const token = await getMicrosoftAccessTokenForUser(profileId)
    if (!token) return 'skip'
    const eventBody: Record<string, unknown> = {
      subject: kontext.summary,
      body: { contentType: 'text', content: kontext.description },
      start: { dateTime: toBerlinWallClock(termin.start_zeit), timeZone: GOOGLE_CALENDAR_TIMEZONE },
      end: { dateTime: toBerlinWallClock(termin.end_zeit), timeZone: GOOGLE_CALENDAR_TIMEZONE },
    }
    if (kontext.location) eventBody.location = { displayName: kontext.location }
    if (termin.ms_event_id) {
      const resp = await fetch(`https://graph.microsoft.com/v1.0/me/events/${termin.ms_event_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      })
      if (!resp.ok) throw new Error(`graph events.update ${resp.status}`)
      return 'updated'
    }
    const resp = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    })
    if (!resp.ok) throw new Error(`graph events.insert ${resp.status}`)
    const created = (await resp.json()) as { id?: string }
    if (created.id) {
      // Idempotenz-Anker (wie google_event_id) — ohne ihn legt der naechste Sync ein Duplikat an.
      const { error: ankerFehler } = await db
        .from('gutachter_termine')
        .update({ ms_event_id: created.id })
        .eq('id', termin.id)
      if (ankerFehler) {
        throw new Error(
          `Graph-Event angelegt (${created.id}), aber ms_event_id nicht gespeichert — naechster Sync erzeugt ein Duplikat: ${ankerFehler.message}`,
        )
      }
    }
    return 'created'
  },
  async remove(termin, db) {
    if (!termin.ms_event_id) return 'skip'
    const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id)
    if (!profileId) return 'skip'
    const token = await getMicrosoftAccessTokenForUser(profileId)
    if (!token) return 'skip'
    const resp = await fetch(`https://graph.microsoft.com/v1.0/me/events/${termin.ms_event_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok && resp.status !== 404) throw new Error(`graph events.delete ${resp.status}`)
    // Referenz loesen — bleibt sie stehen, zeigt sie auf ein geloeschtes Event.
    const { error: refFehler } = await db
      .from('gutachter_termine')
      .update({ ms_event_id: null })
      .eq('id', termin.id)
    if (refFehler) {
      throw new Error(`Graph-Event geloescht, aber ms_event_id nicht zurueckgesetzt: ${refFehler.message}`)
    }
    return 'updated'
  },
}

const DEFAULT_PROVIDERS: KalenderProvider[] = [googleProvider, caldavProvider, outlookProvider]

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
