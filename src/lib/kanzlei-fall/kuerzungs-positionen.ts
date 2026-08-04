import type { SupabaseClient } from '@supabase/supabase-js'
import { FORDERUNGSPOSITION_TYP_LABEL } from './forderungsposition-typ'

// GEO-P2 SP1: Single-Writer für per-Position-Versicherer-Kürzungen.
// Schreibt nach forderungspositionen (quelle='vs_kuerzung'), gespeist aus dem
// vs_kuerzt-Funnel (process-event.ts) + manuellem KB-Subform.

export interface KuerzungsPosition {
  typ: string
  betrag_gefordert?: number | null
  betrag_gekuerzt: number
  bezeichnung?: string | null
}

const ERLAUBTE_TYPEN = new Set(Object.keys(FORDERUNGSPOSITION_TYP_LABEL))

/**
 * Persistiert per-Position-Kürzungen in forderungspositionen.
 * @param db  service_role-Client (bypass RLS) — der Funnel nutzt createAdminClient.
 * @param ref fallId (NOT NULL Pflicht) + claimId (Reader querien per claim_id).
 * Ungültige typ / nicht-finite betrag_gekuerzt werden defensiv übersprungen,
 * bevor der DB-CHECK die ganze Transaktion wirft.
 */
export async function persistKuerzungsPositionen(
  db: SupabaseClient,
  ref: { fallId: string; claimId: string | null },
  positionen: KuerzungsPosition[],
): Promise<{ ok: boolean; geschrieben: number; error?: string }> {
  const rows = positionen
    .filter((p) => ERLAUBTE_TYPEN.has(p.typ) && Number.isFinite(p.betrag_gekuerzt))
    .map((p) => ({
      fall_id: ref.fallId,
      claim_id: ref.claimId,
      typ: p.typ,
      bezeichnung: p.bezeichnung ?? FORDERUNGSPOSITION_TYP_LABEL[p.typ],
      betrag_gefordert: p.betrag_gefordert ?? null,
      betrag_gekuerzt: p.betrag_gekuerzt,
      quelle: 'vs_kuerzung' as const,
    }))
  if (rows.length === 0) return { ok: true, geschrieben: 0 }
  const { error } = await db.from('forderungspositionen').insert(rows)
  if (error) return { ok: false, geschrieben: 0, error: error.message }
  return { ok: true, geschrieben: rows.length }
}
