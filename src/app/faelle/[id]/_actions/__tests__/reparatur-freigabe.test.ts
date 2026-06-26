// Fokussierte Tests fuer reparaturFreigeben / -Zuruecknehmen (Staff-Gate).
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
      // claims update().eq()
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
  })),
}))

beforeEach(() => {
  mockConfig = { authUser: null, profileRolle: null }
  vi.clearAllMocks()
})

describe('reparaturFreigeben / reparaturFreigabeZuruecknehmen', () => {
  it('non-staff (kunde) -> ok:false', async () => {
    mockConfig.authUser = { id: 'u1' }
    mockConfig.profileRolle = 'kunde'
    const { reparaturFreigeben } = await import('../reparatur-freigabe')
    const res = await reparaturFreigeben('c-1')
    expect(res.ok).toBe(false)
  })

  it('nicht eingeloggt -> ok:false', async () => {
    const { reparaturFreigeben } = await import('../reparatur-freigabe')
    const res = await reparaturFreigeben('c-1')
    expect(res.ok).toBe(false)
  })

  it('admin -> ok:true (freigeben)', async () => {
    mockConfig.authUser = { id: 'a1' }
    mockConfig.profileRolle = 'admin'
    const { reparaturFreigeben } = await import('../reparatur-freigabe')
    const res = await reparaturFreigeben('c-1')
    expect(res.ok).toBe(true)
  })

  it('kundenbetreuer -> ok:true (zuruecknehmen)', async () => {
    mockConfig.authUser = { id: 'kb1' }
    mockConfig.profileRolle = 'kundenbetreuer'
    const { reparaturFreigabeZuruecknehmen } = await import('../reparatur-freigabe')
    const res = await reparaturFreigabeZuruecknehmen('c-1')
    expect(res.ok).toBe(true)
  })

  it('dispatch -> ok:false (kein Fallakte-/claims-Write-Pfad)', async () => {
    mockConfig.authUser = { id: 'd1' }
    mockConfig.profileRolle = 'dispatch'
    const { reparaturFreigeben } = await import('../reparatur-freigabe')
    const res = await reparaturFreigeben('c-1')
    expect(res.ok).toBe(false)
  })
})
