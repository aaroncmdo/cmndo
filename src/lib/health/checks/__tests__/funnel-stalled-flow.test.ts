// TDD-Tests fuer funnel-stalled-flow Health-Check.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task2
// Kein echter DB-Zugriff — Fake-CheckCtx mit Supabase-Stubs.
//
// Der Check liest:
//   1. v_claim_phase: { main_phase, claim_id } — Verteilung je Meilenstein-Phase
//   2. claims: { id, status_changed_at } — Alter der Claims (per claim_id Join)
//
// Meilenstein-Reihenfolge: erfassung -> begutachtung -> regulierung -> abschluss
// Ein "Wall" = ein Meilenstein ohne Claims, waehrend mind. MIN_UPSTREAM=5 Claims
// im unmittelbar vorgelagerten Meilenstein seit >14 Tagen feststecken.

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { funnelStalledFlowCheck } from '../funnel-stalled-flow'

// Hilfsfunktion: Datum X Tage in der Vergangenheit
function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Stub-Factory
// view_rows: Zeilen aus v_claim_phase (main_phase + claim_id)
// claim_rows: Zeilen aus claims (id + status_changed_at)
// ---------------------------------------------------------------------------
function makeCtx(
  viewRows: { main_phase: string; claim_id: string }[],
  claimRows: { id: string; status_changed_at: string }[],
): CheckCtx {
  const supabase = {
    from(table: string) {
      if (table === 'v_claim_phase') {
        return {
          select: () => ({
            then: (res: (v: { data: typeof viewRows; error: null }) => unknown) =>
              Promise.resolve(res({ data: viewRows, error: null })),
          }),
        }
      }
      if (table === 'claims') {
        return {
          select: () => ({
            in: (_col: string, _ids: string[]) => ({
              then: (res: (v: { data: typeof claimRows; error: null }) => unknown) =>
                Promise.resolve(res({ data: claimRows, error: null })),
            }),
          }),
        }
      }
      throw new Error(`unerwartete Tabelle: ${table}`)
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

// Bequemlichkeits-Helper: N Claims fuer eine Phase erzeugen
function nClaims(
  n: number,
  phase: string,
  ageDays: number,
): { view: { main_phase: string; claim_id: string }[]; claims: { id: string; status_changed_at: string }[] } {
  const view = Array.from({ length: n }, (_, i) => ({
    main_phase: phase,
    claim_id: `${phase}-${i}`,
  }))
  const claims = view.map((v) => ({
    id: v.claim_id,
    status_changed_at: daysAgo(ageDays),
  }))
  return { view, claims }
}

describe('funnelStalledFlowCheck', () => {
  it('hat korrekte id und category', () => {
    expect(funnelStalledFlowCheck.id).toBe('funnel-stalled-flow')
    expect(funnelStalledFlowCheck.category).toBe('funnel')
  })

  it('liefert ok wenn keine Claims vorhanden', async () => {
    const ctx = makeCtx([], [])
    const result = await funnelStalledFlowCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert ok wenn alle Meilensteine besetzt und Claims nicht zu alt', async () => {
    const { view: v1, claims: c1 } = nClaims(3, 'erfassung', 5)
    const { view: v2, claims: c2 } = nClaims(3, 'begutachtung', 5)
    const { view: v3, claims: c3 } = nClaims(3, 'regulierung', 5)
    const ctx = makeCtx([...v1, ...v2, ...v3], [...c1, ...c2, ...c3])
    const result = await funnelStalledFlowCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert warn wenn ein mittlerer Meilenstein leer ist mit gealtertem Upstream', async () => {
    // begutachtung leer, aber erfassung hat 5 Claims die >14 Tage alt sind
    const { view: v1, claims: c1 } = nClaims(5, 'erfassung', 20)
    // begutachtung = kein Eintrag in view
    const { view: v3, claims: c3 } = nClaims(2, 'regulierung', 5)
    const ctx = makeCtx([...v1, ...v3], [...c1, ...c3])
    const result = await funnelStalledFlowCheck.run(ctx)
    expect(result.status).not.toBe('ok')
    expect(result.detail).toContain('begutachtung')
  })

  it('liefert crit wenn regulierung leer mit grossem gealtertem Upstream', async () => {
    // begutachtung hat 8 Claims >14d; regulierung leer; abschluss leer
    const { view: v2, claims: c2 } = nClaims(8, 'begutachtung', 20)
    const ctx = makeCtx([...v2], [...c2])
    const result = await funnelStalledFlowCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.detail).toContain('regulierung')
  })

  it('liefert crit wenn abschluss leer mit grossem gealtertem Upstream in regulierung', async () => {
    const { view: v3, claims: c3 } = nClaims(8, 'regulierung', 20)
    const { view: v2, claims: c2 } = nClaims(2, 'begutachtung', 3)
    const { view: v1, claims: c1 } = nClaims(2, 'erfassung', 3)
    const ctx = makeCtx([...v1, ...v2, ...v3], [...c1, ...c2, ...c3])
    const result = await funnelStalledFlowCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.detail).toContain('abschluss')
  })

  it('upstream unter MIN_UPSTREAM ergibt kein crit — nur ok oder warn', async () => {
    // erfassung: 4 Claims (< MIN_UPSTREAM=5), begutachtung leer -> kein crit
    const { view: v1, claims: c1 } = nClaims(4, 'erfassung', 20)
    const ctx = makeCtx([...v1], [...c1])
    const result = await funnelStalledFlowCheck.run(ctx)
    // Weniger als MIN_UPSTREAM => kein Wall => ok
    expect(result.status).toBe('ok')
  })

  it('detail enthaelt Wall-Phase und Upstream-Info', async () => {
    const { view: v2, claims: c2 } = nClaims(6, 'begutachtung', 20)
    const ctx = makeCtx([...v2], [...c2])
    const result = await funnelStalledFlowCheck.run(ctx)
    expect(result.detail).toMatch(/regulierung|abschluss/)
    expect(result.detail).toMatch(/\d/)
  })
})
