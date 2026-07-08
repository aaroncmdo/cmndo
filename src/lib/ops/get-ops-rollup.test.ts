// src/lib/ops/get-ops-rollup.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getOpsRollup } from './get-ops-rollup'

// Mock supabase: v_ops_rollup (.select() -> resolves) + profiles (.select().in() -> resolves).
function mockSupabase(opts: { rollup?: unknown[]; rollupError?: unknown; profiles?: unknown[] }) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'v_ops_rollup') {
        return { select: vi.fn(async () => ({ data: opts.rollup ?? [], error: opts.rollupError ?? null })) }
      }
      return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: opts.profiles ?? [], error: null })) })) }
    }),
  } as never
}

describe('getOpsRollup', () => {
  it('baut Zellen, Owner (benannt + Nicht zugewiesen zuletzt) und Totals', async () => {
    const res = await getOpsRollup(
      mockSupabase({
        rollup: [
          { main_phase: 'begutachtung', kundenbetreuer_id: 'kb1', anzahl: 3, stale_anzahl: 1 },
          { main_phase: 'erfassung', kundenbetreuer_id: 'kb2', anzahl: 1, stale_anzahl: 0 },
          { main_phase: 'regulierung', kundenbetreuer_id: null, anzahl: 2, stale_anzahl: 0 },
        ],
        profiles: [
          { id: 'kb1', vorname: 'Lena', nachname: 'Schmidt', email: 'lena@x.de' },
          { id: 'kb2', vorname: null, nachname: null, email: 'tom.k@x.de' },
        ],
      }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.rollup.cells).toHaveLength(3)
    expect(res.rollup.totalAktiv).toBe(6)
    expect(res.rollup.totalStale).toBe(1)
    const names = res.rollup.owners.map((o) => o.name)
    expect(names).toContain('Lena Schmidt')
    expect(names).toContain('tom.k') // email-local-part Fallback wenn kein Name
    expect(names[names.length - 1]).toBe('Nicht zugewiesen') // null-Owner immer zuletzt
  })

  it('liefert {ok:false} bei DB-Fehler', async () => {
    const res = await getOpsRollup(mockSupabase({ rollupError: { message: 'boom' } }))
    expect(res.ok).toBe(false)
  })
})
