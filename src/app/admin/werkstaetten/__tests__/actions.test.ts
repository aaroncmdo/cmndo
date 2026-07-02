// Task 5: Focused tests for createWerkstatt Server-Action.
//
// Strategy: avoid a brittle mega-mock of the full happy-path chain.
// Cover two high-value branches:
//   1. Non-admin caller -> { ok: false }
//   2. Admin but missing required fields -> { ok: false } with validation message
//
// Happy-path end-to-end coverage is handled by the manual integration smoke (Task 11).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted holder to capture the werkstaetten insert payload (happy-path assertion).
const h = vi.hoisted(() => ({ werkstattInsert: null as Record<string, unknown> | null }))

// ─── Mock: next/cache (revalidatePath is a no-op in tests) ──────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ─── Mock: calculateIsochrone (never called in these branches) ───────────────
vi.mock('@/lib/isochrone/calculate-isochrone', () => ({
  calculateIsochrone: vi.fn().mockResolvedValue([]),
}))

// ─── Supabase mock state ─────────────────────────────────────────────────────
// We maintain a simple queue for server-client responses (auth.getUser + profiles.select)
// and a separate flag for the admin client.
type MockConfig = {
  authUser: { id: string } | null
  profileRolle: string | null
  adminCreateUserError?: { message: string } | null
}

let mockConfig: MockConfig = {
  authUser: null,
  profileRolle: null,
  adminCreateUserError: null,
}

// Server client mock: covers getUser + profiles.select chain
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: mockConfig.authUser },
      })),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(async () => ({
            data: mockConfig.profileRolle ? { id: mockConfig.authUser?.id, rolle: mockConfig.profileRolle } : null,
            error: null,
          })),
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

// Admin client mock: covers auth.admin.createUser + from(profiles/werkstaetten)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    auth: {
      admin: {
        createUser: vi.fn().mockImplementation(async () => {
          if (mockConfig.adminCreateUserError) {
            return { data: null, error: mockConfig.adminCreateUserError }
          }
          return { data: { user: { id: 'new-werkstatt-user-id' } }, error: null }
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'werkstaetten') {
        return {
          // Capture the insert payload so tests can assert individual fields
          // (e.g. ansprechpartner_name) are threaded through to the DB row.
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            h.werkstattInsert = payload
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 'w-1' }, error: null }),
            }
          }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'w-1' }, error: null }),
        }
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
  })),
}))

// ─── Helper: make FormData with given fields ─────────────────────────────────
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, val] of Object.entries(fields)) {
    fd.append(key, val)
  }
  return fd
}

// ─── Tests ───────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockConfig = {
    authUser: null,
    profileRolle: null,
    adminCreateUserError: null,
  }
  h.werkstattInsert = null
  vi.clearAllMocks()
})

describe('createWerkstatt', () => {
  it('gibt ok:false zurück wenn kein User eingeloggt ist', async () => {
    mockConfig.authUser = null
    mockConfig.profileRolle = null

    const { createWerkstatt } = await import('../actions')
    const fd = makeFormData({
      name: 'Muster-Werkstatt',
      email: 'werkstatt@example.com',
      lat: '51.5',
      lng: '7.0',
    })
    const result = await createWerkstatt(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Nur Admins dürfen Werkstätten anlegen.')
    }
  })

  it('gibt ok:false zurück wenn der eingeloggte User kein Admin ist', async () => {
    mockConfig.authUser = { id: 'non-admin-user-id' }
    mockConfig.profileRolle = 'dispatch'

    const { createWerkstatt } = await import('../actions')
    const fd = makeFormData({
      name: 'Muster-Werkstatt',
      email: 'werkstatt@example.com',
      lat: '51.5',
      lng: '7.0',
    })
    const result = await createWerkstatt(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Nur Admins dürfen Werkstätten anlegen.')
    }
  })

  it('gibt ok:false zurück wenn name fehlt (Pflichtfeld)', async () => {
    mockConfig.authUser = { id: 'admin-user-id' }
    mockConfig.profileRolle = 'admin'

    const { createWerkstatt } = await import('../actions')
    const fd = makeFormData({
      name: '',  // leer!
      email: 'werkstatt@example.com',
      lat: '51.5',
      lng: '7.0',
    })
    const result = await createWerkstatt(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Pflicht')
    }
  })

  it('gibt ok:false zurück wenn email fehlt (Pflichtfeld)', async () => {
    mockConfig.authUser = { id: 'admin-user-id' }
    mockConfig.profileRolle = 'admin'

    const { createWerkstatt } = await import('../actions')
    const fd = makeFormData({
      name: 'Muster-Werkstatt',
      email: '',  // leer!
      lat: '51.5',
      lng: '7.0',
    })
    const result = await createWerkstatt(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Pflicht')
    }
  })

  it('gibt ok:false zurück wenn Koordinaten fehlen (kein Standort)', async () => {
    mockConfig.authUser = { id: 'admin-user-id' }
    mockConfig.profileRolle = 'admin'

    const { createWerkstatt } = await import('../actions')
    const fd = makeFormData({
      name: 'Muster-Werkstatt',
      email: 'werkstatt@example.com',
      // lat/lng fehlen -> NaN -> nicht finite
    })
    const result = await createWerkstatt(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Pflicht')
    }
  })

  it('übernimmt ansprechpartner_name in den werkstaetten-Insert', async () => {
    mockConfig.authUser = { id: 'admin-user-id' }
    mockConfig.profileRolle = 'admin'

    const { createWerkstatt } = await import('../actions')
    const fd = makeFormData({
      name: 'Muster-Werkstatt',
      email: 'werkstatt@example.com',
      adresse_strasse: 'Musterstr. 1',
      adresse_plz: '44135',
      adresse_ort: 'Dortmund',
      lat: '51.5',
      lng: '7.0',
      ansprechpartner_name: 'Max Muster',
    })
    const result = await createWerkstatt(fd)

    expect(result.ok).toBe(true)
    expect(h.werkstattInsert).not.toBeNull()
    expect(h.werkstattInsert).toMatchObject({ ansprechpartner_name: 'Max Muster' })
  })
})
