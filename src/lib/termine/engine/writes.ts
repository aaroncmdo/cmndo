import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, BezugTyp } from './types'
import { pruefeBelegungStrict } from './belegung'
import { RESERVIERUNG_TTL_MIN } from './constants'

export type TerminTyp = 'sv_begutachtung' | 'kb_beratung' | 'konfrontation'
export type Quelle = 'dispatch' | 'self_service' | 'manuell'

export interface ReserviereInput {
  assignee: Assignee
  von: string // ISO start
  bis: string // ISO end
  quelle: Quelle
  typ?: TerminTyp // default sv_begutachtung
  bezug?: { typ: BezugTyp; id: string }
  ttlMin?: number // default RESERVIERUNG_TTL_MIN
  db?: SupabaseClient
}
export type ReserviereResult =
  | { ok: true; terminId: string; reserviertBis: string }
  | { ok: false; error: string; code: 'belegt' | 'db' }

/** assignee → passende Legacy-FK-Spalte (Dual-Write fuer Phase-3-Lesbarkeit). kanzlei = keine. */
export function assigneeLegacyPatch(a: Assignee): Record<string, string> {
  switch (a.typ) {
    case 'sachverstaendiger': return { sv_id: a.id }
    case 'sv_lead': return { sv_lead_id: a.id }
    case 'kundenbetreuer': return { kb_id: a.id }
    default: return {}
  }
}

/**
 * Reserviert einen Slot (status='reserviert' + reserviert_bis-TTL). Race-sicher ueber den
 * Exclusion-Constraint gutachter_termine_no_assignee_overlap: bei Ueberlappung wirft der
 * INSERT 23P01 → {ok:false, code:'belegt'}. pruefeBelegungStrict ist nur Vor-Check (fail-closed).
 * Dual-Write assignee_* + Legacy-FK. KEIN Legacy-bezug (claim_id/fall_id) → validate-Trigger-Falle.
 */
export async function reserviere(input: ReserviereInput): Promise<ReserviereResult> {
  const { assignee, von, bis, quelle, typ = 'sv_begutachtung', bezug, ttlMin = RESERVIERUNG_TTL_MIN } = input
  const db: SupabaseClient = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()

  const pre = await pruefeBelegungStrict(assignee, von, bis, db)
  if (!pre.ok) return { ok: false, error: pre.error, code: 'db' }
  if (!pre.frei) return { ok: false, error: 'Slot belegt', code: 'belegt' }

  const reserviertBis = new Date(Date.now() + ttlMin * 60_000).toISOString()
  const row: Record<string, unknown> = {
    assignee_typ: assignee.typ,
    assignee_id: assignee.id,
    ...assigneeLegacyPatch(assignee),
    start_zeit: von,
    end_zeit: bis,
    status: 'reserviert',
    reserviert_bis: reserviertBis,
    quelle,
    typ,
    ...(bezug ? { bezug_typ: bezug.typ, bezug_id: bezug.id } : {}),
  }
  const { data, error } = await db.from('gutachter_termine').insert(row).select('id').single()
  if (error) {
    if (error.code === '23P01') return { ok: false, error: 'Slot belegt', code: 'belegt' }
    return { ok: false, error: error.message, code: 'db' }
  }
  return { ok: true, terminId: data!.id as string, reserviertBis }
}
