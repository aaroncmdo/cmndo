// Sync externer Kalender-Events (Google FreeBusy + CalDAV) in sv_kalender_events_cache.
//
// Wird vom Cron /api/cron/sync-external-calendars alle 5 Min aufgerufen.
// Pro SV mit aktiver Verbindung:
//   1. Lade Events der nächsten 35 Tage
//   2. Diff gegen Cache (insert neue, delete verschwundene)
//   3. last_synced_at updaten
//
// Ein SV-Fehler bricht den gesamten Run NICHT ab — nächstes Sync-Fenster
// versucht es erneut.

import { createAdminClient } from '@/lib/supabase/admin'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { google } from 'googleapis'
import { listCalendarEventsFull, type CalDavCredentials } from '@/lib/kalender/caldav/client'
import { decrypt } from '@/lib/kalender/caldav/encryption'

const SYNC_HORIZON_DAYS = 35
const GOOGLE_TIMEOUT_MS = 8000

type CacheRow = {
  sv_id: string
  source: 'google' | 'caldav'
  external_event_id: string
  start_zeit: string
  end_zeit: string
  titel: string | null
}

// ─── Google ────────────────────────────────────────────────────────────────

async function syncGoogle(svId: string, profileId: string, db: ReturnType<typeof createAdminClient>): Promise<{ inserted: number; deleted: number }> {
  const auth = await getGoogleOAuthClientForUser(profileId)
  if (!auth) return { inserted: 0, deleted: 0 }

  const now = new Date()
  const fromIso = now.toISOString()
  const toIso = new Date(now.getTime() + SYNC_HORIZON_DAYS * 86400_000).toISOString()

  let busy: Array<{ start: string; end: string }> = []
  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const result = await Promise.race([
      calendar.freebusy.query({
        requestBody: { timeMin: fromIso, timeMax: toIso, items: [{ id: 'primary' }] },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), GOOGLE_TIMEOUT_MS),
      ),
    ])
    busy = (result.data.calendars?.primary?.busy ?? []).map((b) => ({
      start: b.start ?? '',
      end: b.end ?? '',
    })).filter((b) => b.start && b.end)
  } catch (err) {
    console.warn('[sync-calendars] Google FreeBusy für SV', svId, err instanceof Error ? err.message : err)
    return { inserted: 0, deleted: 0 }
  }

  return diffAndApply(db, svId, 'google', busy.map((b, i) => ({
    sv_id: svId,
    source: 'google' as const,
    // FreeBusy liefert keine stable IDs → Zeitstempel als Pseudo-ID
    external_event_id: `${b.start}__${b.end}`,
    start_zeit: b.start,
    end_zeit: b.end,
    titel: null,
  })))
}

// ─── CalDAV ────────────────────────────────────────────────────────────────

type VerbindungRow = {
  id: string
  sv_id: string
  server_url: string
  username: string
  password_encrypted: string
  calendar_url: string | null
}

async function syncCalDav(row: VerbindungRow, db: ReturnType<typeof createAdminClient>): Promise<{ inserted: number; deleted: number }> {
  let password: string
  try {
    password = await decrypt(row.password_encrypted)
  } catch {
    console.warn('[sync-calendars] CalDAV Decrypt fehlgeschlagen für SV', row.sv_id)
    return { inserted: 0, deleted: 0 }
  }

  const creds: CalDavCredentials = {
    serverUrl: row.server_url,
    username: row.username,
    password,
  }

  const now = new Date()
  const fromIso = now.toISOString()
  const toIso = new Date(now.getTime() + SYNC_HORIZON_DAYS * 86400_000).toISOString()

  let events: Array<{ uid: string; summary: string; start: string; end: string }>
  try {
    const raw = await listCalendarEventsFull(creds, row.calendar_url ?? '', fromIso, toIso)
    events = raw.map((e) => ({
      uid: e.uid || `${e.start}__${e.end}`,
      summary: e.summary ?? '',
      start: e.start,
      end: e.end,
    }))
  } catch (err) {
    console.warn('[sync-calendars] CalDAV Events für SV', row.sv_id, err instanceof Error ? err.message : err)
    return { inserted: 0, deleted: 0 }
  }

  return diffAndApply(db, row.sv_id, 'caldav', events.map((e) => ({
    sv_id: row.sv_id,
    source: 'caldav' as const,
    external_event_id: e.uid,
    start_zeit: e.start,
    end_zeit: e.end,
    titel: e.summary || null,
  })))
}

// ─── Diff + Apply ──────────────────────────────────────────────────────────

async function diffAndApply(
  db: ReturnType<typeof createAdminClient>,
  svId: string,
  source: 'google' | 'caldav',
  incoming: CacheRow[],
): Promise<{ inserted: number; deleted: number }> {
  const now = new Date()
  const fromIso = now.toISOString()

  // Lade vorhandene Cache-Rows für diesen SV + Source im Sync-Fenster
  const { data: existing } = await db
    .from('sv_kalender_events_cache')
    .select('external_event_id')
    .eq('sv_id', svId)
    .eq('source', source)
    .gte('start_zeit', fromIso)

  const existingIds = new Set((existing ?? []).map((r) => r.external_event_id).filter(Boolean))
  const incomingIds = new Set(incoming.map((r) => r.external_event_id).filter(Boolean))

  // Insert neue Events
  const toInsert = incoming.filter((r) => r.external_event_id && !existingIds.has(r.external_event_id))
  let inserted = 0
  if (toInsert.length > 0) {
    const { error } = await db.from('sv_kalender_events_cache').upsert(
      toInsert.map((r) => ({ ...r, last_synced_at: new Date().toISOString() })),
      { onConflict: 'sv_id,source,external_event_id', ignoreDuplicates: false },
    )
    if (error) console.warn('[sync-calendars] Upsert-Fehler:', error.message)
    else inserted = toInsert.length
  }

  // Delete verschwundene Events
  const toDeleteIds = [...existingIds].filter((id) => !incomingIds.has(id))
  let deleted = 0
  if (toDeleteIds.length > 0) {
    const { error } = await db
      .from('sv_kalender_events_cache')
      .delete()
      .eq('sv_id', svId)
      .eq('source', source)
      .in('external_event_id', toDeleteIds)
    if (error) console.warn('[sync-calendars] Delete-Fehler:', error.message)
    else deleted = toDeleteIds.length
  }

  // Stale Events außerhalb des Horizonts löschen
  await db
    .from('sv_kalender_events_cache')
    .delete()
    .eq('sv_id', svId)
    .eq('source', source)
    .lt('start_zeit', fromIso)

  return { inserted, deleted }
}

// ─── Haupt-Export ──────────────────────────────────────────────────────────

export type SyncResult = {
  svId: string
  source: 'google' | 'caldav'
  inserted: number
  deleted: number
  error?: string
}

export async function syncAllExternalCalendars(): Promise<SyncResult[]> {
  const db = createAdminClient()
  const results: SyncResult[] = []

  // ── Google: alle SVs mit aktivem refresh_token ──────────────────────────
  const { data: googleProfiles } = await db
    .from('profiles')
    .select('id, sachverstaendige!inner(id)')
    .not('google_refresh_token', 'is', null)

  for (const p of googleProfiles ?? []) {
    const svRows = Array.isArray(p.sachverstaendige) ? p.sachverstaendige : [p.sachverstaendige]
    for (const sv of svRows) {
      if (!sv?.id) continue
      try {
        const { inserted, deleted } = await syncGoogle(sv.id, p.id, db)
        results.push({ svId: sv.id, source: 'google', inserted, deleted })
      } catch (err) {
        results.push({ svId: sv.id, source: 'google', inserted: 0, deleted: 0, error: String(err) })
      }
    }
  }

  // ── CalDAV: alle aktiven Verbindungen ────────────────────────────────────
  const { data: verbindungen } = await db
    .from('sv_kalender_verbindungen')
    .select('id, sv_id, server_url, username, password_encrypted, calendar_url')
    .eq('provider', 'caldav')
    .is('last_error', null)

  for (const row of (verbindungen ?? []) as VerbindungRow[]) {
    try {
      const { inserted, deleted } = await syncCalDav(row, db)
      results.push({ svId: row.sv_id, source: 'caldav', inserted, deleted })
    } catch (err) {
      results.push({ svId: row.sv_id, source: 'caldav', inserted: 0, deleted: 0, error: String(err) })
    }
  }

  return results
}
