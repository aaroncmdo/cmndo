// src/lib/ops/ops-rollup.types.ts
// Read-model fuer die Admin-Rollup-Matrix (aggregiert v_ops_rollup: Phase x Owner).
import type { ClaimMainPhase } from '@/lib/claims/lifecycle'

/** Eine Zelle der Matrix: Anzahl aktiver Claims je (Phase, Owner) + coarse stale-Count. */
export interface OpsRollupCell {
  phase: ClaimMainPhase
  ownerId: string | null
  anzahl: number
  stale: number
}

/** Eine Owner-Zeile (KB). id=null => "Nicht zugewiesen". */
export interface OpsRollupOwner {
  id: string | null
  name: string
}

export interface OpsRollup {
  cells: OpsRollupCell[]
  /** Zeilen: benannte KBs A->Z, "Nicht zugewiesen" zuletzt. */
  owners: OpsRollupOwner[]
  /** Spalten in kanonischer Reihenfolge. */
  phases: ClaimMainPhase[]
  totalAktiv: number
  totalStale: number
}
