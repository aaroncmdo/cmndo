import { describe, it, expect, vi, beforeEach } from 'vitest'

// findeBestePerson POPULIERT: der SV-Pool (applyDispatchableFilter), die Mapbox-ETA-Matrix
// und die Slot-Wahl (freieSlots) sind gemockt — so testet das hier die ORCHESTRIERUNG
// (exclude/kontingent/Gebiet-Filter, Score+Sticky, Tenure-Sort, topN), die bisher NUR per
// A.2-Shadow-Diff (einmalig gegen Prod) verifiziert war, nicht repeatable. Die pure Score-/
// Geo-Logik selbst liegt in matching-score.test.ts.
vi.mock('@/lib/sv/queries', () => ({ applyDispatchableFilter: vi.fn() }))
vi.mock('@/lib/mapbox/matrix', () => ({ mapboxEtaMatrix: vi.fn() }))
vi.mock('../slots', () => ({ freieSlots: vi.fn(() => Promise.resolve([])) }))

import { findeBestePerson, type FindeBestePersonInput } from '../matching'
import { applyDispatchableFilter } from '@/lib/sv/queries'
import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'

const mockFilter = vi.mocked(applyDispatchableFilter)
const mockEta = vi.mocked(mapboxEtaMatrix)

const ORT = { lat: 50.94, lng: 6.96 } // Koeln-Zentrum

// applyDispatchableFilter + freieSlots sind gemockt → db wird nur fuer das initiale
// from().select() gebraucht (Ergebnis ignoriert der gemockte Filter). Robuster Thenable-Stub.
const db = {
  from: () => ({
    select: () => ({
      eq() { return this }, is() { return this }, not() { return this },
      in() { return this }, gte() { return this }, lte() { return this },
      order() { return this }, limit() { return this },
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    }),
  }),
} as unknown as FindeBestePersonInput['db']

type SvOpts = {
  id: string; paket?: string; lat?: number; lng?: number
  genutzt?: number; gesamt?: number; ablehnungen?: number; partnerSeit?: string; radius?: number
}
function mkSv(o: SvOpts) {
  return {
    id: o.id, profile_id: `${o.id}-p`, paket: o.paket ?? 'standard',
    standort_lat: o.lat ?? 50.95, standort_lng: o.lng ?? 6.96,
    isochrone_polygon: null, paket_umkreis_km: o.radius ?? 40,
    paket_faelle_gesamt: o.gesamt ?? 10, paket_faelle_genutzt: o.genutzt ?? 0,
    offene_faelle: 0, ablehnungen_30_tage: o.ablehnungen ?? 0,
    urlaub_von: null, urlaub_bis: null,
    partner_seit: o.partnerSeit ?? '2026-01-01', created_at: '2026-01-01T00:00:00Z',
    profiles: { vorname: `V${o.id}`, nachname: `N${o.id}` },
  }
}
function poolReturns(svs: ReturnType<typeof mkSv>[]) {
  mockFilter.mockResolvedValue({ data: svs, error: null } as unknown as Awaited<ReturnType<typeof applyDispatchableFilter>>)
}
function matche(input: Partial<FindeBestePersonInput> = {}) {
  return findeBestePerson({
    schadenort: ORT, bezug: { typ: 'lead', id: '00000000-0000-0000-0000-000000000000' },
    quelle: 'dispatch', nurVorschlag: true, db, ...input,
  })
}
function ids(r: Awaited<ReturnType<typeof findeBestePerson>>): string[] {
  return r.ok && r.gebucht === false ? r.kandidaten.map((k) => k.assignee.id) : []
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEta.mockResolvedValue([]) // alle ETA null → Haversine-Fallback (deterministisch, kein Netzwerk)
})

describe('findeBestePerson — populierte Orchestrierung', () => {
  it('exclude-id wird aus dem Pool entfernt', async () => {
    poolReturns([mkSv({ id: 'a' }), mkSv({ id: 'b' })])
    expect(ids(await matche({ excludeAssigneeIds: ['a'] }))).toEqual(['b'])
  })

  it('kontingent-volle nicht-basic SVs fallen raus; basic bleibt (basic-Ausnahme)', async () => {
    poolReturns([
      mkSv({ id: 'pro-voll', paket: 'pro', gesamt: 5, genutzt: 5 }),    // frei=0 → blockiert
      mkSv({ id: 'basic-voll', paket: 'basic', gesamt: 5, genutzt: 5 }), // basic → nie blockiert
    ])
    const got = ids(await matche())
    expect(got).toContain('basic-voll')
    expect(got).not.toContain('pro-voll')
  })

  it('SV ausserhalb von Radius UND Isochrone faellt raus', async () => {
    poolReturns([
      mkSv({ id: 'nah', lat: 50.95, lng: 6.96, radius: 40 }),
      mkSv({ id: 'fern', lat: 53.55, lng: 10.0, radius: 40 }), // Hamburg ~360km ≫ 40
    ])
    expect(ids(await matche())).toEqual(['nah'])
  })

  it('hoeheres Paket gewinnt das Ranking (premium vor standard, beide nah)', async () => {
    poolReturns([
      mkSv({ id: 'standard', paket: 'standard', lat: 50.95, lng: 6.96 }),
      mkSv({ id: 'premium', paket: 'premium', lat: 50.95, lng: 6.96 }),
    ])
    expect(ids(await matche())[0]).toBe('premium')
  })

  it('Sticky-Bonus (+1000) hebt einen schwaecheren SV an die Spitze', async () => {
    poolReturns([
      mkSv({ id: 'strong', paket: 'premium', lat: 50.95, lng: 6.96 }),
      mkSv({ id: 'weak', paket: 'standard', genutzt: 5, lat: 50.96, lng: 6.97 }),
    ])
    expect(ids(await matche({ stickyAssigneeId: 'weak' }))[0]).toBe('weak')
  })

  it('topN begrenzt die Kandidatenzahl', async () => {
    poolReturns(['a', 'b', 'c', 'd'].map((id) => mkSv({ id, lat: 50.95, lng: 6.96 })))
    expect(ids(await matche({ topN: 2 }))).toHaveLength(2)
  })

  it('Tenure-Tie-Break: gleicher Score-Bucket → frueherer Partner zuerst', async () => {
    poolReturns([
      mkSv({ id: 'neu', paket: 'pro', lat: 50.95, lng: 6.96, partnerSeit: '2026-09-01' }),
      mkSv({ id: 'alt', paket: 'pro', lat: 50.95, lng: 6.96, partnerSeit: '2026-01-01' }),
    ])
    expect(ids(await matche())[0]).toBe('alt')
  })

  it('leerer Pool nach Filtern → kein_kandidat', async () => {
    poolReturns([mkSv({ id: 'fern', lat: 53.55, lng: 10.0, radius: 40 })]) // alle ausser Gebiet
    const r = await matche()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('kein_kandidat')
  })
})
