// Phase 1b (SV-Termine kanonisch): der "aktuelle" SV-Termin eines Falls direkt aus
// gutachter_termine (fall_id + assignee_typ='sachverstaendiger') — NICHT aus der stale
// v_faelle_mit_aktuellem_termin.sv_termin. Die View ist claim-scoped (claim_id meist NULL)
// UND DEFINER-row-gated -> liefert dem service/admin-Client 0 Zeilen (MCP-verifiziert 2026-07-07).
// gutachter_termine ist eine Tabelle -> admin-Client sieht sie. Genutzt von storno-actions
// (24h-Frist) + dispatch-fall-actions (termin_bestaetigt-Datum). Spec:
// docs/superpowers/specs/2026-07-07-sv-termine-canonical-source-design.md
import type { SupabaseClient } from '@supabase/supabase-js'

export type FallTerminRow = {
  id: string
  start_zeit: string
  end_zeit: string | null
  status: string
  assignee_id: string | null
}

// Aktive Termin-Zustaende (offen/bindend). abgeschlossen/abgelehnt/storniert zaehlen nicht.
const AKTIVE_STATUSES = ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt', 'gegenvorschlag']

/**
 * Waehlt aus den gutachter_termine-Zeilen eines Falls den "aktuellen" SV-Termin:
 * bevorzugt den naechsten anstehenden aktiven Termin (start_zeit >= now, fruehester),
 * sonst den juengsten vergangenen aktiven Termin. null wenn kein aktiver Termin existiert.
 * Rein & testbar. Zeitvergleich via Date.getTime() — ISO-String-Formate (timestamptz
 * "+00" vs Date.toISOString "Z") duerfen NICHT lexikografisch verglichen werden.
 */
export function pickAktuellerTermin(rows: FallTerminRow[], nowMs: number): FallTerminRow | null {
  const aktiv = rows.filter((r) => AKTIVE_STATUSES.includes(r.status))
  if (aktiv.length === 0) return null
  const withMs = aktiv.map((r) => ({ r, ms: new Date(r.start_zeit).getTime() }))
  const anstehend = withMs.filter((x) => x.ms >= nowMs).sort((a, b) => a.ms - b.ms)
  if (anstehend.length > 0) return anstehend[0].r
  // alle vergangen -> juengster (groesste start_zeit)
  return withMs.slice().sort((a, b) => b.ms - a.ms)[0].r
}

/** Laedt die gutachter_termine eines Falls (SV-Assignee) und liefert den aktuellen aktiven. */
export async function aktuellerTerminFuerFall(
  db: SupabaseClient,
  fallId: string,
): Promise<FallTerminRow | null> {
  const { data, error } = await db
    .from('gutachter_termine')
    .select('id, start_zeit, end_zeit, status, assignee_id')
    .eq('fall_id', fallId)
    .eq('assignee_typ', 'sachverstaendiger')
  if (error) {
    console.error('[aktueller-termin-fuer-fall] query:', error.message)
    return null
  }
  return pickAktuellerTermin((data ?? []) as FallTerminRow[], Date.now())
}
