import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, BelegungsFenster, BezugTyp, VBelegungRow } from './types'

/** Reiner Mapper: v_belegung-Rohzeile → BelegungsFenster. Keine I/O. */
export function rowToFenster(row: VBelegungRow): BelegungsFenster {
  return {
    start: row.start_zeit,
    end: row.end_zeit,
    belegungTyp: row.belegung_typ,
    status: row.status,
    terminTyp: row.termin_typ,
    bezugTyp: (row.bezug_typ as BezugTyp | null) ?? null,
    bezugId: row.bezug_id,
    standortLat: row.standort_lat,
    standortLng: row.standort_lng,
    quelleId: row.quelle_id,
  }
}

/**
 * Liest alle Belegungs-Fenster (Buchungen ∪ externe Blocks) eines Assignees, die
 * sich mit [vonIso, bisIso) überschneiden. Overlap-Semantik identisch zu
 * getCachedBusyWindows: ein Fenster zählt, wenn start < bisIso UND end > vonIso.
 *
 * v_belegung ist service_role-only → ohne übergebenen Client wird der Admin-Client
 * lazy importiert. Der Client wird als permissiver Default-SupabaseClient getypt,
 * weil v_belegung (noch) nicht in den generierten DB-Typen steht (Regen aufgeschoben,
 * Phase-1 Task 6); die Public-API bleibt voll typisiert.
 */
export async function ladeBelegung(
  assignee: Assignee,
  vonIso: string,
  bisIso: string,
  db?: SupabaseClient,
): Promise<BelegungsFenster[]> {
  const client: SupabaseClient = db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const { data, error } = await client
    .from('v_belegung')
    .select('*')
    .eq('assignee_typ', assignee.typ)
    .eq('assignee_id', assignee.id)
    .lt('start_zeit', bisIso)
    .gt('end_zeit', vonIso)
    .order('start_zeit', { ascending: true })

  if (error) {
    console.error('[termine/engine] ladeBelegung:', error.message)
    return []
  }
  return ((data ?? []) as unknown as VBelegungRow[]).map(rowToFenster)
}

/**
 * Ist der Assignee in [vonIso, bisIso) belegt? Aus ladeBelegung abgeleitet →
 * beweisbar konsistent mit ihr.
 */
export async function pruefeBelegung(
  assignee: Assignee,
  vonIso: string,
  bisIso: string,
  db?: SupabaseClient,
): Promise<'frei' | 'belegt'> {
  const fenster = await ladeBelegung(assignee, vonIso, bisIso, db)
  return fenster.length > 0 ? 'belegt' : 'frei'
}
