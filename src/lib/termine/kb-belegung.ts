// KB-Belegungs-Check — single-slot, fail-CLOSED. EINE Busy-Definition fuer die KB-Commit-Pfade
// (bookKbTermin, createKbVideoterminByKb), semantisch deckungsgleich mit dem Offer getAvailableKbSlots:
// aktive kb_beratung-Termine (Overlap) ∪ offene admin_termine des KB (Rueckrufe/Meetings, Overlap).
//
// Bewusst NICHT v_belegung: die fuehrt fuer einen KB zwar kb_beratung + (dormante, nie verdrahtete)
// CalDAV + ausnahme — aber KEIN admin_termine. v_belegung zu nutzen waere also eine REGRESSION
// (admin_termine-Overlaps entkaemen). Deshalb KB-eigener Check.
//
// KB<->KB ist zusaetzlich atomar durch gutachter_termine_no_assignee_overlap geschuetzt (assignee_id
// wird per Normalize-Trigger aus kb_id gesetzt — prod-verifiziert: 33/33 kb_beratung mit assignee_id).
// Dieser Check ist der graceful Pre-Check + die admin_termine-Abdeckung, die der Constraint nicht kennt.

import type { SupabaseClient } from '@supabase/supabase-js'

/** [aStart,aEnd) ∩ [bStart,bEnd) != ∅ (instant-basiert, ms). Adjazenz (aEnd==bStart) zaehlt NICHT. */
function ueberlappt(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Ist der KB im Fenster [startIso, endIso) belegt? Fail-CLOSED: DB-Fehler → {ok:false} (Caller
 * bucht NICHT blind). Prueft kb_beratung-Overlap (aktive Termine) ∪ admin_termine-Overlap
 * (status='offen', zugewiesen_an=kbId; nullable end_zeit → als Punkt behandelt).
 */
export async function pruefeKbBelegt(
  db: SupabaseClient,
  kbId: string,
  startIso: string,
  endIso: string,
): Promise<{ ok: true; frei: boolean } | { ok: false; error: string }> {
  const from = (t: string) => (db as unknown as { from: (t: string) => any }).from(t)
  const startMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return { ok: false, error: 'Ungueltiges Zeitfenster' }

  // 1. Aktive kb_beratung-Termine dieses KB, die das Fenster ueberlappen.
  const { data: beratung, error: bErr } = await from('gutachter_termine')
    .select('id')
    .eq('kb_id', kbId)
    .eq('typ', 'kb_beratung')
    .in('status', ['bestaetigt', 'reserviert'])
    .is('cancelled_at', null)
    .lt('start_zeit', endIso)
    .gt('end_zeit', startIso)
    .limit(1)
  if (bErr) return { ok: false, error: bErr.message }
  if (beratung && beratung.length > 0) return { ok: true, frei: false }

  // 2. Offene admin_termine des KB (Rueckrufe/Meetings). DB-Vorfilter start_zeit < endIso;
  //    Overlap (end > startIso) in-code, weil end_zeit nullable ist (NULL → als Punkt = start).
  const { data: admin, error: aErr } = await from('admin_termine')
    .select('start_zeit, end_zeit')
    .eq('zugewiesen_an', kbId)
    .eq('status', 'offen')
    .lt('start_zeit', endIso)
  if (aErr) return { ok: false, error: aErr.message }
  const adminBelegt = ((admin ?? []) as Array<{ start_zeit: string; end_zeit: string | null }>).some((t) => {
    const aStart = Date.parse(t.start_zeit)
    if (Number.isNaN(aStart)) return false
    const aEnd = t.end_zeit ? Date.parse(t.end_zeit) : aStart
    return ueberlappt(aStart, aEnd, startMs, endMs)
  })
  return { ok: true, frei: !adminBelegt }
}
