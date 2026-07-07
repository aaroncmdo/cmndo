// Kanonische SV-Termin-Quelle: gutachter_termine via assignee_id (CMM-49).
//
// v_faelle_mit_aktuellem_termin.sv_termin / aktueller_termin_* sind stale fuer Termine:
// die View ist claim-scoped (get_aktueller_gt_termin_id(claim_id)), aber gutachter_termine
// haben claim_id meist NULL (47/58; SV-Termine 25/34) -> die Mehrheit der Termine ist ueber
// die Claim-View strukturell nicht erreichbar. Termine leben in gutachter_termine, gekeyt
// ueber assignee_id/assignee_typ. Siehe Spec docs/superpowers/specs/2026-07-07-sv-termine-canonical-source-design.md.
import type { SupabaseClient } from '@supabase/supabase-js'

export type SvTerminRow = {
  id: string
  fall_id: string | null
  lead_id: string | null
  claim_id: string | null
  bezug_typ: string | null
  bezug_id: string | null
  start_zeit: string
  end_zeit: string | null
  status: string
  final_verbindlich_ab: string | null
  gesehen_am: string | null
  besichtigungsort_adresse: string | null
  besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null
  besichtigungsort_place_id: string | null
}

export type SvTermineOpts = { statuses: string[]; from?: string; to?: string }

const SELECT =
  'id, fall_id, lead_id, claim_id, bezug_typ, bezug_id, start_zeit, end_zeit, status, ' +
  'final_verbindlich_ab, gesehen_am, besichtigungsort_adresse, besichtigungsort_lat, ' +
  'besichtigungsort_lng, besichtigungsort_place_id'

/**
 * Reine Query-Bau-Logik (testbar ohne DB): assignee-gescopte gutachter_termine-Query.
 * `qb` ist der `.from('gutachter_termine')`-Builder.
 */
export function buildSvTermineQuery<T>(qb: T, svId: string, opts: SvTermineOpts): T {
  const b = qb as unknown as {
    select: (s: string) => typeof b
    eq: (c: string, v: unknown) => typeof b
    in: (c: string, v: unknown[]) => typeof b
    gte: (c: string, v: string) => typeof b
    lt: (c: string, v: string) => typeof b
    order: (c: string, o: { ascending: boolean }) => typeof b
  }
  let q = b
    .select(SELECT)
    .eq('assignee_id', svId)
    .eq('assignee_typ', 'sachverstaendiger')
    .in('status', opts.statuses)
  if (opts.from) q = q.gte('start_zeit', opts.from)
  if (opts.to) q = q.lt('start_zeit', opts.to)
  return q.order('start_zeit', { ascending: true }) as unknown as T
}

/** Laedt die Termine eines SV aus gutachter_termine (kanonisch, assignee_id). */
export async function svTermine(
  db: SupabaseClient,
  svId: string,
  opts: SvTermineOpts,
): Promise<SvTerminRow[]> {
  const { data, error } = await buildSvTermineQuery(
    db.from('gutachter_termine'),
    svId,
    opts,
  )
  if (error) {
    console.error('[sv-termine] query:', error.message)
    return []
  }
  return (data ?? []) as SvTerminRow[]
}
