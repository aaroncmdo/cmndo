// Wochen-Busy-Slots fuer die SV-Verfuegbarkeit (Slot-Vorschlag).
// 2026-06-01: Aus sv_kalender_events_cache (Google FreeBusy + CalDAV), nicht
// mehr Live-Google-FreeBusy. Damit deckt die Self-Service-Strecke
// (ladeFreieSlots -> getSvBusySlots) jetzt auch CalDAV ab — vorher war sie
// Google-blind und der Kommentar "Google + CalDAV" gelogen.
// Siehe src/lib/kalender/cache-busy.ts.

import { getCachedBusyWindowsByProfile } from '@/lib/kalender/cache-busy'

export type BusySlot = { start: string; end: string }

export async function getSvBusySlots(
  svProfileId: string,
  fromIso: string,
  toIso: string,
): Promise<BusySlot[]> {
  return getCachedBusyWindowsByProfile(svProfileId, fromIso, toIso)
}
