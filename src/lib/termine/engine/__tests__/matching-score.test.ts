import { describe, it, expect } from 'vitest'
import {
  bewerteSvKandidat, W_NETZWERK, W_RANG, vergleicheTenure, sortiereKandidaten,
  istKontingentBlockiert, haversineKm, pointInPolygon, ersterFreierSlot, rangToOrdinal,
  type RankbarerKandidat,
} from '../matching-score'
import type { TagVerfuegbarkeit } from '../types'
import { findeBestePerson } from '../matching'

describe('istKontingentBlockiert', () => {
  it('basic nie blockiert', () => { expect(istKontingentBlockiert('basic', 0)).toBe(false) })
  it('nicht-basic ohne frei blockiert', () => { expect(istKontingentBlockiert('pro', 0)).toBe(true) })
  it('nicht-basic mit frei nicht blockiert', () => { expect(istKontingentBlockiert('pro', 3)).toBe(false) })
})

describe('bewerteSvKandidat (Netzwerkpartner-Boost, 13b)', () => {
  const base = { kontingentGenutzt: 0, ablehnungen30d: 0, etaVomBueroMin: null, distanzKm: 0 }
  it('Netzwerkpartner bekommt W_NETZWERK, Free bekommt 0', () => {
    const partner = bewerteSvKandidat({ ...base, istNetzwerkpartner: true })
    const free = bewerteSvKandidat({ ...base, istNetzwerkpartner: false })
    expect(partner - free).toBe(W_NETZWERK)
  })
  it('rangOrdinal verfeinert INNERHALB des Buckets, kreuzt ihn nie (2*W_RANG < W_NETZWERK)', () => {
    const partnerBronze = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, rangOrdinal: 0 })
    const partnerGold = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, rangOrdinal: 2 })
    const freeGold = bewerteSvKandidat({ ...base, istNetzwerkpartner: false, rangOrdinal: 2 })
    expect(partnerGold - partnerBronze).toBe(2 * W_RANG)
    expect(partnerBronze).toBeGreaterThan(freeGold)
  })
  it('Distanz/Kontingent/Ablehnung wirken negativ', () => {
    const nah = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, distanzKm: 5 })
    const fern = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, distanzKm: 25 })
    expect(nah).toBeGreaterThan(fern)
    const wenigerGenutzt = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, kontingentGenutzt: 0 })
    const mehrGenutzt = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, kontingentGenutzt: 5 })
    expect(wenigerGenutzt).toBeGreaterThan(mehrGenutzt)
  })
  it('null ETA → Haversine-km als Penalty (istNetzwerkpartner(1)*W_NETZWERK(100) - distanzKm)', () => {
    const s = bewerteSvKandidat({ istNetzwerkpartner: true, kontingentGenutzt: 0, ablehnungen30d: 0, etaVomBueroMin: null, distanzKm: 20 })
    expect(s).toBe(1 * 100 - 20)
  })
  it('rangToOrdinal: gold=2, silber=1, bronze/null/undefined=0', () => {
    expect(rangToOrdinal('gold')).toBe(2)
    expect(rangToOrdinal('silber')).toBe(1)
    expect(rangToOrdinal('bronze')).toBe(0)
    expect(rangToOrdinal(null)).toBe(0)
    expect(rangToOrdinal(undefined)).toBe(0)
  })
})

describe('vergleicheTenure', () => {
  const mk = (partnerSeit: string | null, createdAt: string | null, id: string) => ({ partnerSeit, createdAt, id })
  it('früheres partner_seit gewinnt', () => {
    expect(vergleicheTenure(mk('2026-04-22', null, 'a'), mk('2026-05-01', null, 'b'))).toBeLessThan(0)
  })
  it('gleiches partner_seit → created_at entscheidet', () => {
    expect(vergleicheTenure(mk('2026-04-22', '2026-04-22T08:00:00Z', 'a'), mk('2026-04-22', '2026-04-22T09:00:00Z', 'b'))).toBeLessThan(0)
  })
  it('null-Tenure landet hinten', () => {
    expect(vergleicheTenure(mk(null, null, 'a'), mk('2026-04-22', null, 'b'))).toBeGreaterThan(0)
  })
})

describe('sortiereKandidaten', () => {
  const mk = (score: number, partnerSeit: string, id: string): RankbarerKandidat => ({ score, partnerSeit, createdAt: null, id })
  it('klar höherer Score gewinnt (überschreibt Tenure)', () => {
    const r = sortiereKandidaten([mk(100, '2026-01-01', 'alt'), mk(250, '2026-09-01', 'neu')])
    expect(r[0].id).toBe('neu')
  })
  it('gleicher Bucket ("Zweifelsfall") → früherer Partner gewinnt', () => {
    const r = sortiereKandidaten([mk(200, '2026-09-01', 'neu'), mk(202, '2026-01-01', 'alt')])
    expect(r[0].id).toBe('alt')
  })
})

describe('ersterFreierSlot', () => {
  const tag = (datum: string, slots: { uhrzeit: string; dauer: number }[]): TagVerfuegbarkeit =>
    ({ datum, wochentag: 'Mo', frei: slots.length > 0, anzahl_slots: slots.length, slots })
  it('frühester Tag mit Slot', () => {
    const r = ersterFreierSlot([tag('2026-06-10', []), tag('2026-06-11', [{ uhrzeit: '09:00', dauer: 45 }, { uhrzeit: '10:30', dauer: 45 }])])
    expect(r).toEqual({ datum: '2026-06-11', uhrzeit: '09:00', dauerMin: 45 })
  })
  it('keine Slots → null', () => {
    expect(ersterFreierSlot([tag('2026-06-10', [])])).toBeNull()
  })
  it('notBefore überspringt vergangene Slots am selben Tag', () => {
    const r = ersterFreierSlot(
      [tag('2026-06-11', [{ uhrzeit: '09:00', dauer: 45 }, { uhrzeit: '15:30', dauer: 45 }])],
      { datum: '2026-06-11', uhrzeit: '14:58' },
    )
    expect(r).toEqual({ datum: '2026-06-11', uhrzeit: '15:30', dauerMin: 45 })
  })
  it('notBefore an einem früheren Tag → ganzer Vortag übersprungen', () => {
    const r = ersterFreierSlot(
      [tag('2026-06-10', [{ uhrzeit: '09:00', dauer: 45 }]), tag('2026-06-11', [{ uhrzeit: '09:00', dauer: 45 }])],
      { datum: '2026-06-11', uhrzeit: '08:00' },
    )
    expect(r).toEqual({ datum: '2026-06-11', uhrzeit: '09:00', dauerMin: 45 })
  })
})

describe('haversineKm + pointInPolygon', () => {
  it('haversine ~0 für identische Punkte', () => { expect(haversineKm(52.5, 13.4, 52.5, 13.4)).toBeCloseTo(0, 5) })
  it('pointInPolygon: drin/draußen', () => {
    const quad: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]]
    expect(pointInPolygon([5, 5], quad)).toBe(true)
    expect(pointInPolygon([15, 5], quad)).toBe(false)
  })
})

describe('findeBestePerson — Frühausstiege (Stub-DB, kein Netzwerk)', () => {
  // Minimaler Supabase-Stub: select-Kette endet in einem awaitable mit { data: [] }.
  const leererPoolDb = {
    from: () => ({
      select: () => ({
        eq: function () { return this },
        is: function () { return this },
        not: function () { return this },
        or: function () { return this },
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      }),
    }),
  } as unknown as Parameters<typeof findeBestePerson>[0]['db']

  it('leerer Pool → kein_kandidat (ohne Mapbox/Netzwerk)', async () => {
    const r = await findeBestePerson({
      schadenort: { lat: 52.5, lng: 13.4 },
      bezug: { typ: 'lead', id: '00000000-0000-0000-0000-000000000000' },
      quelle: 'dispatch',
      db: leererPoolDb,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('kein_kandidat')
  })

  it('nicht unterstützter assignee_typ → nicht_unterstuetzt', async () => {
    const r = await findeBestePerson({
      schadenort: { lat: 52.5, lng: 13.4 },
      bezug: { typ: 'lead', id: '00000000-0000-0000-0000-000000000000' },
      quelle: 'dispatch',
      // @ts-expect-error — bewusst ungültiger Typ für den Guard-Test
      assigneeTyp: 'kanzlei',
      db: leererPoolDb,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('nicht_unterstuetzt')
  })
})
