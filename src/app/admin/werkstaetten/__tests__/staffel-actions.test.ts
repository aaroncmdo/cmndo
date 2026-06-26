// Fokussierte Tests fuer setWerkstattStaffel (admin-gate + Validierung).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let mockConfig: { authUser: { id: string } | null; profileRolle: string | null } = {
  authUser: null,
  profileRolle: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: vi.fn().mockImplementation(async () => ({ data: { user: mockConfig.authUser } })) },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockConfig.profileRolle ? { rolle: mockConfig.profileRolle } : null,
            error: null,
          }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) }
    }),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation(() => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  })),
}))

beforeEach(() => {
  mockConfig = { authUser: null, profileRolle: null }
  vi.clearAllMocks()
})

describe('setWerkstattStaffel', () => {
  it('gibt ok:false zurueck wenn der Caller kein Admin ist', async () => {
    mockConfig.authUser = { id: 'u1' }
    mockConfig.profileRolle = 'dispatch'
    const { setWerkstattStaffel } = await import('../staffel-actions')
    const res = await setWerkstattStaffel('w-1', [{ schwelle: 10, bonus_betrag_netto: 500 }])
    expect(res.ok).toBe(false)
  })

  it('gibt ok:false bei doppelter Schwelle', async () => {
    mockConfig.authUser = { id: 'a1' }
    mockConfig.profileRolle = 'admin'
    const { setWerkstattStaffel } = await import('../staffel-actions')
    const res = await setWerkstattStaffel('w-1', [
      { schwelle: 10, bonus_betrag_netto: 500 },
      { schwelle: 10, bonus_betrag_netto: 600 },
    ])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('doppelt')
  })

  it('gibt ok:false bei nicht-positiver Schwelle', async () => {
    mockConfig.authUser = { id: 'a1' }
    mockConfig.profileRolle = 'admin'
    const { setWerkstattStaffel } = await import('../staffel-actions')
    const res = await setWerkstattStaffel('w-1', [{ schwelle: -5, bonus_betrag_netto: 500 }])
    expect(res.ok).toBe(false)
  })

  it('gibt ok:true bei gueltigen Stufen (Admin)', async () => {
    mockConfig.authUser = { id: 'a1' }
    mockConfig.profileRolle = 'admin'
    const { setWerkstattStaffel } = await import('../staffel-actions')
    const res = await setWerkstattStaffel('w-1', [
      { schwelle: 10, bonus_betrag_netto: 500 },
      { schwelle: 25, bonus_betrag_netto: 1500 },
    ])
    expect(res.ok).toBe(true)
  })
})
