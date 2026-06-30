// TDD-Tests fuer funnel-stuck-claims Health-Check.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task2
// Kein echter DB-Zugriff — Fake-CheckCtx mit Supabase-Stub.

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { funnelStuckClaimsCheck } from '../funnel-stuck-claims'

// ---------------------------------------------------------------------------
// Stub-Factory: liefert eine CheckCtx-Instanz, deren supabase.from('claims')
// eine fixe Zeilen-Liste zurueckgibt. Jede Zeile: { id, operative_status, status_changed_at }.
// ---------------------------------------------------------------------------
function makeCtx(rows: { id: string; operative_status: string; status_changed_at: string }[]): CheckCtx {
  const supabase = {
    from(table: string) {
      if (table !== 'claims') throw new Error(`unerwartete Tabelle: ${table}`)
      return {
        select: () => ({
          not: (_col: string, _op: string, _val: unknown) => ({
            then: (res: (v: { data: typeof rows; error: null }) => unknown) =>
              Promise.resolve(res({ data: rows, error: null })),
          }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

// Hilfsfunktion: Datum X Tage in der Vergangenheit als ISO-String.
function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

describe('funnelStuckClaimsCheck', () => {
  it('liefert ok wenn keine aktiven Claims vorhanden', async () => {
    const ctx = makeCtx([])
    const result = await funnelStuckClaimsCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('liefert ok wenn alle Claims innerhalb SLA', async () => {
    const ctx = makeCtx([
      // sv-termin SLA=10d, 3d alt -> ok
      { id: 'c1', operative_status: 'sv-termin', status_changed_at: daysAgo(3) },
      { id: 'c2', operative_status: 'sv-termin', status_changed_at: daysAgo(5) },
    ])
    const result = await funnelStuckClaimsCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('liefert warn wenn 3 Claims ueber SLA (unter 10-Schwelle)', async () => {
    const ctx = makeCtx([
      // sv-termin SLA=10d — 12d alt => ueber SLA
      { id: 'c1', operative_status: 'sv-termin', status_changed_at: daysAgo(12) },
      { id: 'c2', operative_status: 'sv-termin', status_changed_at: daysAgo(15) },
      { id: 'c3', operative_status: 'sv-termin', status_changed_at: daysAgo(11) },
    ])
    const result = await funnelStuckClaimsCheck.run(ctx)
    expect(result.status).toBe('warn')
    expect(result.metric).toBeGreaterThanOrEqual(3)
    expect(result.detail).toContain('SLA')
  })

  it('liefert crit wenn 12 Claims ueber SLA (>= 10-Schwelle)', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      operative_status: 'sv-termin', // SLA=10d
      status_changed_at: daysAgo(15), // 5d ueber SLA
    }))
    const ctx = makeCtx(rows)
    const result = await funnelStuckClaimsCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.metric).toBeGreaterThanOrEqual(12)
  })

  it('liefert crit wenn aeltester Claim mehr als 2x seine Phasen-SLA ueberschreitet', async () => {
    // ersterfassung SLA=7d; 2x=14d; 20d alt => crit
    const ctx = makeCtx([
      { id: 'c1', operative_status: 'ersterfassung', status_changed_at: daysAgo(20) },
      { id: 'c2', operative_status: 'ersterfassung', status_changed_at: daysAgo(8) },
    ])
    const result = await funnelStuckClaimsCheck.run(ctx)
    expect(result.status).toBe('crit')
  })

  it('detail enthaelt Phase und Anzahl der betroffenen Claims', async () => {
    const ctx = makeCtx([
      { id: 'c1', operative_status: 'besichtigung', status_changed_at: daysAgo(10) }, // SLA=7 -> ueber
    ])
    const result = await funnelStuckClaimsCheck.run(ctx)
    expect(result.detail).toContain('besichtigung')
    expect(result.detail).toMatch(/\d/)
  })

  it('sampleIds enthaelt bis zu 5 Claim-IDs', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `claim-${i}`,
      operative_status: 'sv-termin',
      status_changed_at: daysAgo(15),
    }))
    const ctx = makeCtx(rows)
    const result = await funnelStuckClaimsCheck.run(ctx)
    expect(result.sampleIds).toBeDefined()
    expect(result.sampleIds!.length).toBeLessThanOrEqual(5)
  })

  it('hat korrekte id und category', () => {
    expect(funnelStuckClaimsCheck.id).toBe('funnel-stuck-claims')
    expect(funnelStuckClaimsCheck.category).toBe('funnel')
  })
})
