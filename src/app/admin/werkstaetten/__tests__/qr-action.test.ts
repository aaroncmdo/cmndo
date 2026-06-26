// Fokussierte Tests fuer werkstattQrSvg (admin-gate + happy path).
import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockConfig: { authUser: { id: string } | null; profileRolle: string | null; werkstattName: string | null } = {
  authUser: null,
  profileRolle: null,
  werkstattName: null,
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
      if (table === 'werkstaetten') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockConfig.werkstattName ? { name: mockConfig.werkstattName } : null,
            error: null,
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
  })),
}))

beforeEach(() => {
  mockConfig = { authUser: null, profileRolle: null, werkstattName: null }
  vi.clearAllMocks()
})

describe('werkstattQrSvg', () => {
  it('gibt ok:false zurueck wenn der Caller kein Admin ist', async () => {
    mockConfig.authUser = { id: 'u1' }
    mockConfig.profileRolle = 'dispatch'
    const { werkstattQrSvg } = await import('../qr-action')
    const res = await werkstattQrSvg('w-1')
    expect(res.ok).toBe(false)
  })

  it('gibt ok:true mit svg + url zurueck fuer Admin + gueltige id', async () => {
    mockConfig.authUser = { id: 'admin1' }
    mockConfig.profileRolle = 'admin'
    mockConfig.werkstattName = 'Test-Werkstatt'
    const { werkstattQrSvg } = await import('../qr-action')
    const res = await werkstattQrSvg('w-42')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.svg).toContain('<svg')
      expect(res.url).toContain('/start/werkstatt/w-42')
      expect(res.name).toBe('Test-Werkstatt')
    }
  })
})
