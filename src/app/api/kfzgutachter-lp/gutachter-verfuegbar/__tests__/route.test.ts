import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Service-Client: liefert ein konfiguriertes Set an SV-Zeilen via Promise-then.
// Der Supabase-Chain (.from().select().eq().is().not()) ist thenable — beim
// await wird then() aufgerufen. Wir routen das je nach Tabellen-Argument
// (sachverstaendige = Tier-1, sv_leads = Tier-3).
const mockSvSelect = vi.fn()
const mockSvLeadsSelect = vi.fn().mockReturnValue({ data: [], error: null })
const mockServiceClient = {
  from: vi.fn().mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => {
      if (table === 'sachverstaendige') resolve(mockSvSelect())
      else if (table === 'sv_leads') resolve(mockSvLeadsSelect())
      else resolve({ data: [], error: null })
    },
  })),
}
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockServiceClient,
}))

// Admin-Client für Profile/Reviews
const mockProfilesSelect = vi.fn().mockResolvedValue({ data: [], error: null })
const mockBewertungenSelect = vi.fn().mockResolvedValue({ data: [], error: null })
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: vi.fn().mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation(() =>
        table === 'profiles' ? mockProfilesSelect() : mockBewertungenSelect(),
      ),
    })),
  }),
}))

const originalFetch = global.fetch
beforeEach(() => {
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
})
afterEach(() => {
  vi.unstubAllEnvs()
  global.fetch = originalFetch
})

// Import nach den Mocks
import { POST } from '../route'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/kfzgutachter-lp/gutachter-verfuegbar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const KOELN_POLY = {
  type: 'Polygon',
  coordinates: [[[6.85, 50.90], [7.05, 50.90], [7.05, 51.00], [6.85, 51.00], [6.85, 50.90]]],
}
const DUESSELDORF_POLY = {
  type: 'Polygon',
  coordinates: [[[6.70, 51.18], [6.85, 51.18], [6.85, 51.30], [6.70, 51.30], [6.70, 51.18]]],
}

function stubGoogle(lat: number, lng: number, status = 'OK') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status, result: { geometry: { location: { lat, lng } } } }),
  } as unknown as Response)
}

describe('POST /api/kfzgutachter-lp/gutachter-verfuegbar', () => {
  describe('Input-Validation', () => {
    it('400 bei invalid JSON', async () => {
      const req = new Request('http://localhost/x', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('400 bei garbage place_id', async () => {
      const res = await POST(makeReq({ placeId: "'; DROP TABLE" }))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Invalid place_id')
    })

    it('503 wenn GOOGLE_PLACES_API_KEY fehlt', async () => {
      vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      expect(res.status).toBe(503)
    })
  })

  describe('Google-Places-Lookup', () => {
    it('502 wenn Google-Status NOT_OK', async () => {
      stubGoogle(0, 0, 'ZERO_RESULTS')
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      expect(res.status).toBe(502)
    })
  })

  describe('Point-in-Polygon + Count', () => {
    it('zählt SVs deren Isochrone den Punkt umfasst', async () => {
      stubGoogle(50.94, 6.96) // Köln-Hbf
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'A', standort_adresse: null, profile_id: null },
          { id: 'sv2', isochrone_polygon: DUESSELDORF_POLY, paket: 'free', firmenname: 'B', standort_adresse: null, profile_id: null },
          { id: 'sv3', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'C', standort_adresse: null, profile_id: null },
        ],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.count).toBe(2) // sv1 + sv3
    })

    it('zählt Tier-3 sv_leads in den Count, NICHT in den Profile-Stack', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'standard', firmenname: 'Tier-1 SV', standort_adresse: 'X, 50667 Köln', profile_id: 'p1' },
        ],
        error: null,
      })
      mockProfilesSelect.mockResolvedValueOnce({
        data: [{ id: 'p1', vorname: 'Max', avatar_url: null }],
        error: null,
      })
      // 2 Tier-3 matches + 1 Düsseldorf-Miss
      mockSvLeadsSelect.mockReturnValue({
        data: [
          { id: 'svl1', isochrone_polygon: KOELN_POLY },
          { id: 'svl2', isochrone_polygon: DUESSELDORF_POLY },
          { id: 'svl3', isochrone_polygon: KOELN_POLY },
        ],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.count).toBe(3) // 1 Tier-1 + 2 Tier-3 in Köln
      expect(json.gutachter).toHaveLength(1) // nur Tier-1-standard im Stack
      expect(json.gutachter[0].id).toBe('sv1')
    })

    it('toleriert sv_leads-Query-Error (fallback Tier-1-only)', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: null, standort_adresse: null, profile_id: null },
        ],
        error: null,
      })
      mockSvLeadsSelect.mockReturnValue({ data: null, error: { message: 'boom' } })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.count).toBe(1) // nur Tier-1, kein Crash
    })

    it('filtert Test-Accounts raus', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'Test Aaron Gutachter GmbH', standort_adresse: null, profile_id: null },
          { id: 'sv2', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: 'Echter SV', standort_adresse: null, profile_id: null },
        ],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.count).toBe(1)
    })

    it('überspringt invalide Isochronen (Legacy-Array-Format) ohne zu crashen', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: [{ lat: 50.9, lng: 6.96 }], paket: 'free', firmenname: null, standort_adresse: null, profile_id: null },
          { id: 'sv2', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: null, standort_adresse: null, profile_id: null },
        ],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.count).toBe(1)
    })
  })

  describe('Profile-Stack — Privacy', () => {
    it('exposed Profile NUR für paket="standard"', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [
          { id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'free', firmenname: null, standort_adresse: 'X 1, 50667 Köln', profile_id: 'p1' },
          { id: 'sv2', isochrone_polygon: KOELN_POLY, paket: 'standard', firmenname: null, standort_adresse: 'Y 2, 50667 Köln', profile_id: 'p2' },
        ],
        error: null,
      })
      mockProfilesSelect.mockResolvedValueOnce({
        data: [{ id: 'p2', vorname: 'Max', avatar_url: 'https://x/a.png' }],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.count).toBe(2)
      expect(json.gutachter).toHaveLength(1)
      expect(json.gutachter[0]).toMatchObject({
        id: 'sv2',
        vorname_initiale: 'M.',
        stadt: 'Köln',
        avatar_url: 'https://x/a.png',
      })
    })

    it('Bewertungen werden korrekt eingebunden', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({
        data: [{ id: 'sv1', isochrone_polygon: KOELN_POLY, paket: 'standard', firmenname: null, standort_adresse: 'X, 50667 Köln', profile_id: 'p1' }],
        error: null,
      })
      mockProfilesSelect.mockResolvedValueOnce({
        data: [{ id: 'p1', vorname: 'Anna', avatar_url: null }],
        error: null,
      })
      mockBewertungenSelect.mockResolvedValueOnce({
        data: [{ profile_id: 'p1', durchschnitt: '4.7', anzahl_bewertungen: 89 }],
        error: null,
      })
      const res = await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const json = await res.json()
      expect(json.gutachter[0].bewertungs_durchschnitt).toBe(4.7)
      expect(json.gutachter[0].bewertungs_anzahl).toBe(89)
    })
  })

  describe('Min-Loading-Delay', () => {
    it('Response dauert mindestens 600 ms (Wahrnehmungs-Floor)', async () => {
      stubGoogle(50.94, 6.96)
      mockSvSelect.mockReturnValue({ data: [], error: null })
      const t0 = Date.now()
      await POST(makeReq({ placeId: 'ChIJ1234567890' }))
      const elapsed = Date.now() - t0
      expect(elapsed).toBeGreaterThanOrEqual(580) // 20 ms Toleranz für CI-Jitter
    })
  })
})
