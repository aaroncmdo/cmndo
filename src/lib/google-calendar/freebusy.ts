// AAR-694 Teil A: FreeBusy-Check im SV-Matching.
// AAR-717: Multi-Provider (Google + CalDAV).
// 2026-06-01: Auf sv_kalender_events_cache umgestellt — EINE Quelle statt
// Live-FreeBusy/CalDAV pro Request. Der Cron (/api/cron/sync-external-calendars)
// befuellt den Cache (Google FreeBusy + CalDAV); hier wird nur noch gelesen.
// Vorteile: deckt beide Provider konsistent ab, kein Per-Request-Timeout-
// Fail-open (-> kein falsches "frei"), 1 DB-Read statt N Live-Calls beim
// Batch-Matching. Siehe src/lib/kalender/cache-busy.ts.

import {
  getCachedBusyWindows,
  svIdForProfile,
} from '@/lib/kalender/cache-busy'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'

// Re-Export fuer Bestands-Importer (findBestSV importiert BusyWindow von hier).
export type BusyWindow = { start: string; end: string }

/**
 * Prueft ob der SV zum gewuenschten Zeitpunkt (+/- Puffer) frei ist.
 *   - 'frei':      kein Cache-Event ueberlappt das Fenster
 *   - 'belegt':    mind. ein Cache-Event ueberlappt -> SV faellt aus
 *   - 'unbekannt': kein sachverstaendige-Record -> SV bleibt Kandidat (fail-open)
 */
export async function checkSvFreeBusy(
  svProfileId: string,
  terminIso: string,
  pufferMinuten = 60,
  terminDauerMin = TERMIN_DAUER_MIN,
): Promise<'frei' | 'belegt' | 'unbekannt'> {
  const termin = new Date(terminIso)
  // AAR-718: Asymmetrisches Fenster — Puffer davor, dann Termin-Dauer,
  // dann Puffer danach. Fuer 10:00-Termin mit 45 min + 60 min Puffer:
  // [09:00, 11:45] muss kalenderfrei sein.
  const timeMin = new Date(termin.getTime() - pufferMinuten * 60 * 1000)
  const timeMax = new Date(termin.getTime() + (terminDauerMin + pufferMinuten) * 60 * 1000)

  const svId = await svIdForProfile(svProfileId)
  if (!svId) return 'unbekannt'

  const windows = await getCachedBusyWindows(svId, timeMin.toISOString(), timeMax.toISOString())
  return windows.length > 0 ? 'belegt' : 'frei'
}

/**
 * Parallel-Check fuer mehrere SVs. Liefert Map<profileId, Status>.
 */
export async function checkSvFreeBusyBatch(
  svProfileIds: string[],
  terminIso: string,
  pufferMinuten = 60,
  terminDauerMin = TERMIN_DAUER_MIN,
): Promise<Map<string, 'frei' | 'belegt' | 'unbekannt'>> {
  const entries = await Promise.all(
    svProfileIds.map(async (id) => [id, await checkSvFreeBusy(id, terminIso, pufferMinuten, terminDauerMin)] as const),
  )
  return new Map(entries)
}

/**
 * AAR-719: Busy-Zeitfenster eines SVs ueber einen Zeitraum (Google + CalDAV,
 * aus dem Cache). Wird von findNextFreeSlotForSv genutzt — ein DB-Read pro SV
 * statt Live-API. Fail-open: kein sachverstaendige-Record -> leere Liste.
 */
export async function getBusyWindows(
  svProfileId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<BusyWindow[]> {
  const svId = await svIdForProfile(svProfileId)
  if (!svId) return []
  return getCachedBusyWindows(svId, rangeStartIso, rangeEndIso)
}
