import { describe, it, expect } from 'vitest'
import { computeCoverageGaps } from './coverage'

// Quadrat-Isochrone um (lng 13, lat 52), Kantenlänge ~2 Grad
const sqIso = { coordinates: [[[12,51],[14,51],[14,53],[12,53],[12,51]]] }
const lead = (id: string, lng: number, lat: number) => ({ id, name:'L', status:'neu', lng, lat, ort:null, kanal:null, erstelltAm:'', hasActiveTermin:false }) as any
const sv = (id: string, iso: unknown) => ({ id, name:'S', typ:'kfz', verifiziert:true, paket:'pro', genutzt:0, gesamt:10, gesperrt:false, urlaub:false, standortLat:52, standortLng:13, isochrone: iso, car:{mode:'none',lat:null,lng:null,heading:null,zielLat:null,zielLng:null,terminId:null,etaMinuten:null} }) as any

describe('computeCoverageGaps', () => {
  it('Lead innerhalb der Isochrone = keine Lücke', () => {
    const gaps = computeCoverageGaps([lead('a', 13, 52)], [sv('s1', sqIso)])
    expect(gaps.has('a')).toBe(false)
  })
  it('Lead ausserhalb aller Isochronen = Lücke', () => {
    const gaps = computeCoverageGaps([lead('b', 20, 60)], [sv('s1', sqIso)])
    expect(gaps.has('b')).toBe(true)
  })
  it('SV ohne Isochrone deckt nichts', () => {
    const gaps = computeCoverageGaps([lead('c', 13, 52)], [sv('s1', null)])
    expect(gaps.has('c')).toBe(true)
  })
})
