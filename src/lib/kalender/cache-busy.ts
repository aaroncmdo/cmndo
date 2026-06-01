// Eine Quelle fuer SV-Verfuegbarkeit: die vom Cron (/api/cron/sync-external-
// calendars) vorbefuellten Busy-Slots aus sv_kalender_events_cache (Google
// FreeBusy + CalDAV vereinheitlicht). Ersetzt die Live-FreeBusy-/CalDAV-Calls
// pro Request in freebusy.ts + busy-slots.ts.
//
// Warum Cache statt Live:
//  - Deckt ALLE Provider ab (Google + CalDAV) ohne Per-Pfad-Drift — vorher war
//    getSvBusySlots Google-only (Self-Service-Strecke CalDAV-blind).
//  - Kein Per-Request-Timeout-Fail-open (2s) mehr -> kein falsches "frei" bei
//    langsamer iCloud/Google-API -> kein Doppelbuchungs-Risiko.
//  - 1 DB-Read statt N Live-API-Calls beim Batch-Matching (findBestSV).
//  - Staleness <= Cron-Intervall (5 Min) — fuer Slot-Planung (Stunden/Tage
//    voraus) unkritisch.

import { createAdminClient } from '@/lib/supabase/admin'

export type BusyWindow = { start: string; end: string }

/**
 * Busy-Fenster eines SVs (sachverstaendige.id) im Zeitraum aus dem Cache.
 * Overlap-Semantik: ein Event zaehlt, wenn es das Fenster schneidet
 * (start < to UND end > from) — nicht nur wenn es im Fenster startet.
 */
export async function getCachedBusyWindows(
  svId: string,
  fromIso: string,
  toIso: string,
): Promise<BusyWindow[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('sv_kalender_events_cache')
    .select('start_zeit, end_zeit')
    .eq('sv_id', svId)
    .lt('start_zeit', toIso)
    .gt('end_zeit', fromIso)
    .order('start_zeit')
  return (data ?? [])
    .filter((e) => e.start_zeit && e.end_zeit)
    .map((e) => ({ start: e.start_zeit as string, end: e.end_zeit as string }))
}

/** profile_id (auth.uid) -> sachverstaendige.id, oder null. */
export async function svIdForProfile(profileId: string): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Wie getCachedBusyWindows, aber Eingabe ist die profile_id. */
export async function getCachedBusyWindowsByProfile(
  svProfileId: string,
  fromIso: string,
  toIso: string,
): Promise<BusyWindow[]> {
  const svId = await svIdForProfile(svProfileId)
  if (!svId) return []
  return getCachedBusyWindows(svId, fromIso, toIso)
}
