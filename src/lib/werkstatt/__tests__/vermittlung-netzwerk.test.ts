// P2-T6 Wire-Test (Stack A): findQualifizierteReparaturWerkstaetten partitioniert NACH
// qualifiziereWerkstaetten (#4101/#4125-Reorder) — Freund-Werkstatt an Position 0, ohne
// Owner bit-identisches Verhalten.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const make = () => {
      const c: any = {}
      c.select = () => c
      c.eq = () => c
      c.maybeSingle = () => Promise.resolve({ data: null, error: null })
      return c
    }
    return { from: () => make() } as any
  },
}))
vi.mock('@/lib/werkstatt/finder', () => ({
  findWerkstaetten: vi.fn(async () => [
    { id: 'w1', name: 'W1', faehigkeiten: ['karosserie'], verifiziert: true },
    { id: 'w2', name: 'W2', faehigkeiten: ['karosserie'], verifiziert: true },
    { id: 'w3', name: 'W3', faehigkeiten: ['karosserie'], verifiziert: true },
  ]),
}))
vi.mock('@/lib/werkstatt/bedarf/ermittle-bedarf', () => ({
  ermittleReparaturbedarf: vi.fn(async () => ({ kategorien: [], quelle: 'unbekannt', confidence: 0 })),
}))
vi.mock('@/lib/netzwerk/freunde', () => ({
  ladeFreundKandidatIds: vi.fn(async () => new Set<string>()),
}))
vi.mock('@/lib/faelle/reparatur-cursor', () => ({
  advanceReparaturCursorTo: vi.fn(),
  fallIdForClaim: vi.fn(),
}))

import { findQualifizierteReparaturWerkstaetten } from '../vermittlung-server'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'

describe('findQualifizierteReparaturWerkstaetten — Netzwerk-Partition (Stack A)', () => {
  it('mit ownerProfilId: Freund-Werkstatt an Position 0 mit imNetzwerk=true', async () => {
    vi.mocked(ladeFreundKandidatIds).mockResolvedValueOnce(new Set(['w2']))

    const res = await findQualifizierteReparaturWerkstaetten({
      target: 'claim',
      id: 'c1',
      ownerProfilId: 'owner-1',
    })

    expect(res.werkstaetten.map((w) => w.id)).toEqual(['w2', 'w1', 'w3'])
    expect(res.werkstaetten[0].imNetzwerk).toBe(true)
    expect(res.werkstaetten[1].imNetzwerk).toBeUndefined()
    expect(ladeFreundKandidatIds).toHaveBeenCalledTimes(1) // K10: EIN Batch pro Aufruf
  })

  it('ohne ownerProfilId: Reihenfolge unveraendert, kein Freund-Read', async () => {
    vi.mocked(ladeFreundKandidatIds).mockClear()

    const res = await findQualifizierteReparaturWerkstaetten({ target: 'claim', id: 'c1' })

    expect(res.werkstaetten.map((w) => w.id)).toEqual(['w1', 'w2', 'w3'])
    expect(ladeFreundKandidatIds).not.toHaveBeenCalled()
  })

  it('nicht-qualifizierter Freund (fit=passt_nicht) floatet NICHT (Engine schlaegt Freundschaft)', async () => {
    const { ermittleReparaturbedarf } = await import('@/lib/werkstatt/bedarf/ermittle-bedarf')
    const { findWerkstaetten } = await import('@/lib/werkstatt/finder')
    // Bedarf 'lackierung' mit niedriger confidence (kein Hart-Filter): w2 kann es nicht -> passt_nicht.
    vi.mocked(ermittleReparaturbedarf).mockResolvedValueOnce({
      kategorien: ['lackierung'],
      quelle: 'manuell',
      confidence: 40,
    } as never)
    vi.mocked(findWerkstaetten).mockResolvedValueOnce([
      { id: 'w1', name: 'W1', faehigkeiten: ['lackierung'], verifiziert: true },
      { id: 'w2', name: 'W2', faehigkeiten: ['karosserie'], verifiziert: true },
    ] as never)
    vi.mocked(ladeFreundKandidatIds).mockResolvedValueOnce(new Set(['w2']))

    const res = await findQualifizierteReparaturWerkstaetten({
      target: 'claim',
      id: 'c1',
      ownerProfilId: 'owner-1',
    })

    expect(res.werkstaetten.map((w) => w.id)).toEqual(['w1', 'w2'])
    expect(res.werkstaetten.find((w) => w.id === 'w2')?.imNetzwerk).toBeUndefined()
  })
})
