// P4 T9: die Kunde-Finder-Zuweisung traegt quelle='gutachter', wenn der Claim einen
// SV-Netzwerk-Owner hat (SV-Vermittlungs-Flow) — sonst unveraendert 'kunde'.
import { describe, it, expect, vi, beforeEach } from 'vitest'

let svRowForOwner: { id: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'kunde-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'c1', reparatur_werkstatt_id: null, schadenort_lat: null, schadenort_lng: null },
            error: null,
          }),
        }),
      }),
    }),
  }),
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'werkstaetten' ? { id: 'w1', status: 'aktiv' } : svRowForOwner,
            error: null,
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/netzwerk/resolve-netzwerk-owner', () => ({
  resolveNetzwerkOwnerProfilId: vi.fn(async () => null as string | null),
}))
vi.mock('@/lib/werkstatt/vermittlung-server', () => ({
  assignReparaturWerkstatt: vi.fn(async () => ({ ok: true })),
  findQualifizierteReparaturWerkstaetten: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { waehleWerkstattPortal } from '../werkstatt-finder-actions'
import { assignReparaturWerkstatt } from '@/lib/werkstatt/vermittlung-server'
import { resolveNetzwerkOwnerProfilId } from '@/lib/netzwerk/resolve-netzwerk-owner'

beforeEach(() => {
  svRowForOwner = null
  vi.mocked(assignReparaturWerkstatt).mockClear().mockResolvedValue({ ok: true })
  vi.mocked(resolveNetzwerkOwnerProfilId).mockClear().mockResolvedValue(null)
})

describe('waehleWerkstattPortal — quelle-Ableitung (P4 T9)', () => {
  it('SV-Netzwerk-Owner am Claim -> quelle=gutachter', async () => {
    vi.mocked(resolveNetzwerkOwnerProfilId).mockResolvedValueOnce('sv-profil-1')
    svRowForOwner = { id: 'sv-1' }

    const r = await waehleWerkstattPortal('c1', 'w1')
    expect(r.ok).toBe(true)
    expect(assignReparaturWerkstatt).toHaveBeenCalledWith(
      expect.objectContaining({ quelle: 'gutachter', id: 'c1', werkstattId: 'w1' }),
    )
  })

  it('Owner vorhanden aber KEIN SV-Profil (Werkstatt-/Flotten-Owner) -> quelle=kunde', async () => {
    vi.mocked(resolveNetzwerkOwnerProfilId).mockResolvedValueOnce('werkstatt-profil-1')
    svRowForOwner = null

    await waehleWerkstattPortal('c1', 'w1')
    expect(assignReparaturWerkstatt).toHaveBeenCalledWith(expect.objectContaining({ quelle: 'kunde' }))
  })

  it('kein Owner -> quelle=kunde (Alt-Verhalten)', async () => {
    await waehleWerkstattPortal('c1', 'w1')
    expect(assignReparaturWerkstatt).toHaveBeenCalledWith(expect.objectContaining({ quelle: 'kunde' }))
  })

  it('Owner-Aufloesung wirft -> quelle=kunde (non-fatal fallback)', async () => {
    vi.mocked(resolveNetzwerkOwnerProfilId).mockRejectedValueOnce(new Error('down'))
    const r = await waehleWerkstattPortal('c1', 'w1')
    expect(r.ok).toBe(true)
    expect(assignReparaturWerkstatt).toHaveBeenCalledWith(expect.objectContaining({ quelle: 'kunde' }))
  })
})
