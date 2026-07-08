// src/lib/ops/get-ops-rollup.ts
// Liest die abgeleitete Aggregat-View v_ops_rollup (Phase x Owner) im USER-Kontext
// (security_invoker -> Gate greift: Admin sieht alles, KB seine). Owner-Namen aus profiles.
// Ergebnis-Objekt statt throw (AGENTS.md Server-Action-Pattern).
import type { SupabaseClient } from '@supabase/supabase-js'
import { toClaimMainPhase, type ClaimMainPhase } from '@/lib/claims/lifecycle'
import type { OpsRollup, OpsRollupCell, OpsRollupOwner } from './ops-rollup.types'

interface RollupRow {
  main_phase: string | null
  kundenbetreuer_id: string | null
  anzahl: number | null
  stale_anzahl: number | null
}

const CANONICAL_PHASES: ClaimMainPhase[] = ['erfassung', 'begutachtung', 'regulierung', 'abschluss']

export async function getOpsRollup(
  supabase: SupabaseClient,
): Promise<{ ok: true; rollup: OpsRollup } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('v_ops_rollup')
    .select('main_phase,kundenbetreuer_id,anzahl,stale_anzahl')
  if (error) return { ok: false, error: (error as { message: string }).message }

  const rows = (data ?? []) as RollupRow[]

  // Owner-Namen — nur die tatsaechlich vorkommenden KB-IDs (eine profiles-Query).
  const ownerIds = Array.from(
    new Set(rows.map((r) => r.kundenbetreuer_id).filter((v): v is string => !!v)),
  )
  const nameById = new Map<string, string>()
  if (ownerIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id,vorname,nachname,email').in('id', ownerIds)
    for (const p of (profs ?? []) as { id: string; vorname: string | null; nachname: string | null; email: string | null }[]) {
      const full = [p.vorname, p.nachname].filter(Boolean).join(' ').trim()
      // Fallback-Kette: voller Name -> email-local-part (z.B. "smoke-admin") -> id-Prefix.
      const fallback = p.email ? p.email.split('@')[0] : p.id.slice(0, 8)
      nameById.set(p.id, full || fallback)
    }
  }

  const cells: OpsRollupCell[] = rows.map((r) => ({
    phase: toClaimMainPhase(r.main_phase),
    ownerId: r.kundenbetreuer_id,
    anzahl: Number(r.anzahl ?? 0),
    stale: Number(r.stale_anzahl ?? 0),
  }))

  // Owners: benannte KBs A->Z, dann "Nicht zugewiesen" (null) zuletzt — nur solche mit >=1 Zelle.
  const ownerIdSet = new Set<string | null>(cells.map((c) => c.ownerId))
  const namedOwners: OpsRollupOwner[] = ownerIds
    .filter((id) => ownerIdSet.has(id))
    .map((id) => ({ id, name: nameById.get(id) ?? id.slice(0, 8) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const owners: OpsRollupOwner[] = ownerIdSet.has(null)
    ? [...namedOwners, { id: null, name: 'Nicht zugewiesen' }]
    : namedOwners

  const totalAktiv = cells.reduce((s, c) => s + c.anzahl, 0)
  const totalStale = cells.reduce((s, c) => s + c.stale, 0)

  return { ok: true, rollup: { cells, owners, phases: CANONICAL_PHASES, totalAktiv, totalStale } }
}
