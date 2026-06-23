// Task 3: Focused tests for createSvLead Server-Action.
//
// Strategy: test three key branches:
//   1. Non-admin caller -> { ok: false }
//   2. Admin but missing name -> { ok: false }
//   3. Admin but missing lat/lng (no coords from GooglePlaceAutocomplete) -> { ok: false }
//   4. Happy path -> upsertSvLead called with parsed fields + quelle:'admin'

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock: next/cache ────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ─── Mock: upsertSvLead (canonical write path) ───────────────────────────────
const mockUpsertSvLead = vi.fn()

vi.mock('@/lib/sv-leads/upsert', () => ({
  upsertSvLead: (...args: unknown[]) => mockUpsertSvLead(...args),
}))

// ─── Supabase mock state ─────────────────────────────────────────────────────
type MockConfig = {
  authUser: { id: string } | null
  profileRolle: string | null
}

let mockConfig: MockConfig = {
  authUser: null,
  profileRolle: null,
}

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
            data: mockConfig.profileRolle
              ? { id: mockConfig.authUser?.id, rolle: mockConfig.profileRolle }
              : null,
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: 'new-sv-lead-id', error: null }),
  })),
}))

// ─── Helper ──────────────────────────────────────────────────────────────────
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, val] of Object.entries(fields)) {
    fd.append(key, val)
  }
  return fd
}

// ─── Tests ───────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockConfig = { authUser: null, profileRolle: null }
  vi.clearAllMocks()
  mockUpsertSvLead.mockResolvedValue({ ok: true, id: 'new-sv-lead-id' })
})

describe('createSvLead', () => {
  it('gibt ok:false zurueck wenn kein User eingeloggt ist', async () => {
    mockConfig.authUser = null
    mockConfig.profileRolle = null

    const { createSvLead } = await import('../actions')
    const fd = makeFormData({ name: 'Test SV', lat: '51.5', lng: '7.0', adresse: 'Musterstr. 1, 12345 Musterstadt' })
    const result = await createSvLead(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('gibt ok:false zurueck wenn der User kein Admin ist', async () => {
    mockConfig.authUser = { id: 'non-admin-id' }
    mockConfig.profileRolle = 'dispatch'

    const { createSvLead } = await import('../actions')
    const fd = makeFormData({ name: 'Test SV', lat: '51.5', lng: '7.0', adresse: 'Musterstr. 1, 12345 Musterstadt' })
    const result = await createSvLead(fd)

    expect(result.ok).toBe(false)
  })

  it('gibt ok:false zurueck wenn name fehlt (Pflichtfeld)', async () => {
    mockConfig.authUser = { id: 'admin-id' }
    mockConfig.profileRolle = 'admin'

    const { createSvLead } = await import('../actions')
    const fd = makeFormData({ name: '', lat: '51.5', lng: '7.0', adresse: 'Musterstr. 1, 12345 Musterstadt' })
    const result = await createSvLead(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('gibt ok:false zurueck wenn lat/lng fehlen (kein Standort)', async () => {
    mockConfig.authUser = { id: 'admin-id' }
    mockConfig.profileRolle = 'admin'

    const { createSvLead } = await import('../actions')
    // Kein lat/lng -> ungueltige Koordinaten
    const fd = makeFormData({ name: 'Test SV', adresse: 'Musterstr. 1, 12345 Musterstadt' })
    const result = await createSvLead(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('happy path: ruft upsertSvLead mit geparsten Feldern + quelle:admin auf', async () => {
    mockConfig.authUser = { id: 'admin-id' }
    mockConfig.profileRolle = 'admin'

    const { createSvLead } = await import('../actions')
    const fd = makeFormData({
      name: 'Max Mustermann',
      firma: 'Muster GmbH',
      adresse: 'Musterstr. 1, 12345 Musterstadt',
      plz: '12345',
      ort: 'Musterstadt',
      lat: '51.5',
      lng: '7.0',
      telefon: '+49 221 123456',
      email: 'max@muster.de',
      dat_expert_nr: 'DAT-999',
      qualifikationen: 'Gutachter, Kfz-Sachverstaendiger',
      paket_umkreis_km: '25',
    })
    const result = await createSvLead(fd)

    expect(result.ok).toBe(true)
    expect(mockUpsertSvLead).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Max Mustermann',
        firma: 'Muster GmbH',
        adresse: 'Musterstr. 1, 12345 Musterstadt',
        lat: 51.5,
        lng: 7.0,
        quelle: 'admin',
      }),
    )
    // dat_id ist NICHT Pflicht; wenn nicht angegeben, darf es null oder undefined sein
    const callArg = mockUpsertSvLead.mock.calls[0][0]
    expect(callArg.quelle).toBe('admin')
    expect(callArg.paket_umkreis_km).toBe(25)
    expect(callArg.qualifikationen).toEqual(['Gutachter', 'Kfz-Sachverstaendiger'])
  })

  it('setzt paket_umkreis_km auf 15 wenn nicht angegeben', async () => {
    mockConfig.authUser = { id: 'admin-id' }
    mockConfig.profileRolle = 'admin'

    const { createSvLead } = await import('../actions')
    const fd = makeFormData({
      name: 'Test SV',
      adresse: 'Musterstr. 1',
      lat: '51.5',
      lng: '7.0',
    })
    const result = await createSvLead(fd)

    expect(result.ok).toBe(true)
    const callArg = mockUpsertSvLead.mock.calls[0][0]
    expect(callArg.paket_umkreis_km).toBe(15)
  })

  it('dat_id ist optional: happy path ohne dat_id moeglich (plz Pflicht fuer Dedup)', async () => {
    mockConfig.authUser = { id: 'admin-id' }
    mockConfig.profileRolle = 'admin'

    const { createSvLead } = await import('../actions')
    const fd = makeFormData({
      name: 'Nicht-DAT SV',
      adresse: 'Testweg 5, 50667 Koeln',
      plz: '50667',
      lat: '50.93',
      lng: '6.96',
      // kein dat_id, kein dat_expert_nr — plz ist Pflicht fuer Nicht-DAT-Dedup
    })
    const result = await createSvLead(fd)

    expect(result.ok).toBe(true)
    const callArg = mockUpsertSvLead.mock.calls[0][0]
    // dat_id sollte null oder undefined sein (nicht fehlen als String-"undefined")
    expect(callArg.dat_id == null).toBe(true)
  })
})
