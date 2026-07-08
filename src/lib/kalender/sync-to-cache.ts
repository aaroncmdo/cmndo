// Sync externer Kalender-Events (Google FreeBusy + CalDAV) in sv_kalender_events_cache.
//
// Wird vom Cron /api/cron/sync-external-calendars alle 5 Min aufgerufen.
// SP1 (2026-07): assignee-generisch — pro PROFIL mit aktiver Verbindung (SV, Kundenbetreuer, …):
//   1. Lade Events der nächsten 35 Tage
//   2. Diff gegen Cache (insert neue, delete verschwundene) — profil-gekeyed
//   3. Retention-Prune
// Ein Profil-Fehler bricht den gesamten Run NICHT ab.

import { createAdminClient } from '@/lib/supabase/admin'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { google } from 'googleapis'
import { listAllCalendarEventsFull, type CalDavCredentials } from '@/lib/kalender/caldav/client'
import { decrypt } from '@/lib/kalender/caldav/encryption'

// 2026-07-08 (Aaron): grosszuegiges festes Fenster [-90d, +365d] — Busy-Blocking + juengste
// Historie sichtbar. DB-driven: der Cron haelt sv_kalender_events_cache aktuell (SSoT), die UI
// liest nur die DB. Fetch- UND Diff-existing-Fenster nutzen dieselben Konstanten (sonst Duplikate).
const SYNC_HORIZON_DAYS = 365
const SYNC_BACKFILL_DAYS = 90
const GOOGLE_TIMEOUT_MS = 8000

type CacheRow = {
  profile_id: string
  source: 'google' | 'caldav'
  external_event_id: string
  start_zeit: string
  end_zeit: string
  titel: string | null
}

// ─── Google ────────────────────────────────────────────────────────────────

async function syncGoogle(profileId: string, db: ReturnType<typeof createAdminClient>): Promise<{ inserted: number; deleted: number }> {
  const auth = await getGoogleOAuthClientForUser(profileId)
  if (!auth) return { inserted: 0, deleted: 0 }

  const now = new Date()
  const fromIso = new Date(now.getTime() - SYNC_BACKFILL_DAYS * 86400_000).toISOString()
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
    console.warn('[sync-calendars] Google FreeBusy für Profil', profileId, err instanceof Error ? err.message : err)
    return { inserted: 0, deleted: 0 }
  }

  return diffAndApply(db, profileId, 'google', busy.map((b) => ({
    profile_id: profileId,
    source: 'google' as const,
    // FreeBusy liefert keine stable IDs → Zeitstempel als Pseudo-ID
    external_event_id: `${b.start}__${b.end}`,
    start_zeit: b.start,
    end_zeit: b.end,
    titel: null,
  })))
}

// ─── CalDAV ──────────────────────────────────────────────────────────────

type VerbindungRow = {
  id: string
  profile_id: string
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
    console.warn('[sync-calendars] CalDAV Decrypt fehlgeschlagen für Profil', row.profile_id)
    return { inserted: 0, deleted: 0 }
  }

  const creds: CalDavCredentials = {
    serverUrl: row.server_url,
    username: row.username,
    password,
  }

  const now = new Date()
  const fromIso = new Date(now.getTime() - SYNC_BACKFILL_DAYS * 86400_000).toISOString()
  const toIso = new Date(now.getTime() + SYNC_HORIZON_DAYS * 86400_000).toISOString()

  let events: Array<{ uid: string; summary: string; start: string; end: string }>
  try {
    // ALLE Kalender des Accounts (nicht nur der gewaehlte) — Busy-Blocking deckt Arbeit+Privat+…
    // claimondo-* UIDs raus: das sind unsere EIGENEN in iCloud geschriebenen Termine (Write-back);
    // sie werden schon als Claimondo-Termin angezeigt -> nicht zusaetzlich als externe Busy doppeln.
    const raw = await listAllCalendarEventsFull(creds, fromIso, toIso)
    events = raw
      .filter((e) => !e.uid.startsWith('claimondo-'))
      .map((e) => ({
      uid: e.uid || `${e.start}__${e.end}`,
      summary: e.summary ?? '',
      start: e.start,
      end: e.end,
    }))
  } catch (err) {
    console.warn('[sync-calendars] CalDAV Events für Profil', row.profile_id, err instanceof Error ? err.message : err)
    return { inserted: 0, deleted: 0 }
  }

  return diffAndApply(db, row.profile_id, 'caldav', events.map((e) => ({
    profile_id: row.profile_id,
    source: 'caldav' as const,
    external_event_id: e.uid,
    start_zeit: e.start,
    end_zeit: e.end,
    titel: e.summary || null,
  })))
}

// ─── Retention (permanente externe Belegung) ────────────────────────────────

const RETENTION_DAYS = 90

export async function pruneStaleExternalEvents(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  source: 'google' | 'caldav',
): Promise<void> {
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString()
  const { error } = await db
    .from('sv_kalender_events_cache')
    .delete()
    .eq('profile_id', profileId)
    .eq('source', source)
    .lt('start_zeit', cutoffIso)
  if (error) console.warn('[sync-calendars] Retention-Prune-Fehler:', error.message)
}

// ─── Diff + Apply ──────────────────────────────────────────────────────────

async function diffAndApply(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  source: 'google' | 'caldav',
  incoming: CacheRow[],
): Promise<{ inserted: number; deleted: number }> {
  const now = new Date()
  // Existing-Fenster == Fetch-Fenster (now-7d): sonst wären Events der letzten 7 Tage nie in
  // `existing` -> toInsert würde sie jeden Lauf als „neu" duplizieren (Plain-Insert, kein onConflict).
  const fromIso = new Date(now.getTime() - SYNC_BACKFILL_DAYS * 86400_000).toISOString()

  const { data: existing } = await db
    .from('sv_kalender_events_cache')
    .select('external_event_id')
    .eq('profile_id', profileId)
    .eq('source', source)
    .gte('start_zeit', fromIso)

  const existingIds = new Set((existing ?? []).map((r) => r.external_event_id).filter(Boolean))
  const incomingIds = new Set(incoming.map((r) => r.external_event_id).filter(Boolean))

  const toInsert = incoming.filter((r) => r.external_event_id && !existingIds.has(r.external_event_id))
  let inserted = 0
  if (toInsert.length > 0) {
    // Plain-Insert (kein onConflict): der profil-gekeyte Cache hat im Transition-Fenster keinen
    // passenden Unique (die (sv_id,…)-Unique bleibt für den alten Cron). toInsert ist bereits gegen
    // `existing` gefiltert; seltene Races self-heilen via nächsten Sync-Lauf + Prune.
    const { error } = await db
      .from('sv_kalender_events_cache')
      .insert(toInsert.map((r) => ({ ...r, last_synced_at: new Date().toISOString() })))
    if (error) console.warn('[sync-calendars] Insert-Fehler:', error.message)
    else inserted = toInsert.length
  }

  const toDeleteIds = [...existingIds].filter((id) => !incomingIds.has(id))
  let deleted = 0
  if (toDeleteIds.length > 0) {
    const { error } = await db
      .from('sv_kalender_events_cache')
      .delete()
      .eq('profile_id', profileId)
      .eq('source', source)
      .in('external_event_id', toDeleteIds)
    if (error) console.warn('[sync-calendars] Delete-Fehler:', error.message)
    else deleted = toDeleteIds.length
  }

  await pruneStaleExternalEvents(db, profileId, source)

  return { inserted, deleted }
}

// ─── Haupt-Export ──────────────────────────────────────────────────────────

export type SyncResult = {
  profileId: string
  source: 'google' | 'caldav'
  inserted: number
  deleted: number
  error?: string
}

export async function syncAllExternalCalendars(): Promise<SyncResult[]> {
  const db = createAdminClient()
  const results: SyncResult[] = []

  // ── Google: ALLE Profile mit aktivem refresh_token (nicht mehr nur SV) ────
  const { data: googleProfiles } = await db
    .from('profiles')
    .select('id')
    .not('google_refresh_token', 'is', null)

  for (const p of googleProfiles ?? []) {
    if (!p?.id) continue
    try {
      const { inserted, deleted } = await syncGoogle(p.id as string, db)
      results.push({ profileId: p.id as string, source: 'google', inserted, deleted })
    } catch (err) {
      results.push({ profileId: p.id as string, source: 'google', inserted: 0, deleted: 0, error: String(err) })
    }
  }

  // ── CalDAV: kanonisch aus sv_kalender_verbindungen (dort schreibt der Connect-Flow +
  // liest die gesamte UI). Die frühere kalender_verbindungen-Quelle wurde nur per Einmal-
  // Backfill befüllt (kein Mirror-Trigger, DB-verifiziert 2026-07-08) -> NEUE Verbindungen
  // landeten nie im Sync. profile_id via sachverstaendige aufgelöst (Cache bleibt profil-gekeyed).
  const { data: verbindungen } = await db
    .from('sv_kalender_verbindungen')
    .select('id, sv_id, server_url, username, password_encrypted, calendar_url')
    .eq('provider', 'caldav')
    .is('last_error', null)

  const svIds = [...new Set((verbindungen ?? []).map((r) => r.sv_id).filter(Boolean) as string[])]
  const svToProfile = new Map<string, string>()
  if (svIds.length) {
    const { data: svs } = await db.from('sachverstaendige').select('id, profile_id').in('id', svIds)
    for (const s of (svs ?? []) as Array<{ id: string; profile_id: string | null }>) {
      if (s.profile_id) svToProfile.set(s.id, s.profile_id)
    }
  }

  for (const raw of (verbindungen ?? []) as Array<Record<string, unknown>>) {
    const svId = raw.sv_id as string | null
    const profileId = svId ? svToProfile.get(svId) : undefined
    if (!profileId) continue
    const row: VerbindungRow = {
      id: raw.id as string,
      profile_id: profileId,
      server_url: raw.server_url as string,
      username: raw.username as string,
      password_encrypted: raw.password_encrypted as string,
      calendar_url: (raw.calendar_url as string | null) ?? null,
    }
    try {
      const { inserted, deleted } = await syncCalDav(row, db)
      results.push({ profileId, source: 'caldav', inserted, deleted })
    } catch (err) {
      results.push({ profileId, source: 'caldav', inserted: 0, deleted: 0, error: String(err) })
    }
  }

  return results
}
