// Tests fuer den puren Geo-Matching-Kern des Werkstatt-Finders.
// Reine Funktion rankWerkstaetten — keine DB, keine Mocks noetig.

import { describe, it, expect } from 'vitest'
import { rankWerkstaetten, type WerkstattFinderRow } from '../finder'

// Berlin Mitte als Origin.
const ORIGIN = { lat: 52.520008, lng: 13.404954 }

// Hilfs-Builder: minimaler Row-Shape ohne distanz_km (die wird annotiert).
type RawRow = Omit<WerkstattFinderRow, 'distanz_km' | 'passt'>

function row(over: Partial<RawRow> & Pick<RawRow, 'id'>): RawRow {
  return {
    name: over.name ?? 'Werkstatt',
    adresse_strasse: over.adresse_strasse ?? null,
    adresse_plz: over.adresse_plz ?? null,
    adresse_ort: over.adresse_ort ?? null,
    telefon: over.telefon ?? null,
    lat: over.lat ?? null,
    lng: over.lng ?? null,
    status: over.status ?? 'aktiv',
    faehigkeiten: over.faehigkeiten ?? null,
    verifiziert: over.verifiziert ?? false,
    ...over,
  }
}

describe('rankWerkstaetten', () => {
  it('sortiert aktive Werkstaetten nach Distanz aufsteigend, filtert gesperrte raus und annotiert distanz_km', () => {
    const rows: RawRow[] = [
      // fern: Hamburg (~255 km)
      row({ id: 'fern', name: 'Fern-Werkstatt', lat: 53.551086, lng: 9.993682 }),
      // nah: nahe Berlin Mitte (~2 km)
      row({ id: 'nah', name: 'Nah-Werkstatt', lat: 52.5, lng: 13.4 }),
      // gesperrt: geografisch sehr nah, muss aber rausfallen
      row({ id: 'gesperrt', name: 'Gesperrt-Werkstatt', lat: 52.521, lng: 13.405, status: 'gesperrt' }),
    ]

    const result = rankWerkstaetten(rows, ORIGIN)

    // gesperrte raus -> nur 2 uebrig
    expect(result).toHaveLength(2)
    // gesperrte nicht enthalten
    expect(result.find((r) => r.id === 'gesperrt')).toBeUndefined()
    // aufsteigend sortiert: nah zuerst, fern zuletzt
    expect(result[0].id).toBe('nah')
    expect(result[1].id).toBe('fern')
    // distanz_km annotiert + nah < fern
    expect(result[0].distanz_km).toBeGreaterThan(0)
    expect(result[0].distanz_km).toBeLessThan(result[1].distanz_km)
    // Plausibilitaet: nah ~2-3 km, fern ~250+ km
    expect(result[0].distanz_km).toBeLessThan(10)
    expect(result[1].distanz_km).toBeGreaterThan(200)
  })

  it('schiebt Werkstaetten ohne lat/lng ans Ende (Infinity-Distanz), filtert sie aber nicht raus', () => {
    const rows: RawRow[] = [
      row({ id: 'ohne-geo', name: 'Ohne-Geo', lat: null, lng: null }),
      row({ id: 'nah', name: 'Nah', lat: 52.5, lng: 13.4 }),
    ]

    const result = rankWerkstaetten(rows, ORIGIN)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('nah')
    expect(result[1].id).toBe('ohne-geo')
    expect(result[1].distanz_km).toBe(Infinity)
  })

  it('filtert auch nicht-aktive Status (z.B. inaktiv) raus', () => {
    const rows: RawRow[] = [
      row({ id: 'inaktiv', name: 'Inaktiv', lat: 52.5, lng: 13.4, status: 'inaktiv' }),
      row({ id: 'aktiv', name: 'Aktiv', lat: 52.51, lng: 13.41, status: 'aktiv' }),
    ]

    const result = rankWerkstaetten(rows, ORIGIN)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('aktiv')
  })
})

// SP1 Task 4: Kategorie-Matching (passt-Flag + Sortierung)
const base = (over: Partial<{ id: string; faehigkeiten: string[] | null; lat: number; lng: number }>) => ({
  id: over.id ?? 'w', name: over.id ?? 'W', adresse_strasse: null, adresse_plz: null,
  adresse_ort: null, telefon: null, lat: over.lat ?? 50.9, lng: over.lng ?? 6.9,
  status: 'aktiv', faehigkeiten: over.faehigkeiten ?? null, verifiziert: false,
})
const ORIGIN_KOELN = { lat: 50.94, lng: 6.96 } // Koeln

describe('rankWerkstaetten + Kategorie', () => {
  it('ohne kategorie: reine Distanz-Sortierung (Regression)', () => {
    const nah = base({ id: 'nah', lat: 50.94, lng: 6.96 })
    const fern = base({ id: 'fern', lat: 52.5, lng: 13.4 })
    const r = rankWerkstaetten([fern, nah], ORIGIN_KOELN)
    expect(r.map((x) => x.id)).toEqual(['nah', 'fern'])
    expect(r[0].passt).toBe(true)
  })
  it('faehigkeiten leer = Vollservice -> passt=true', () => {
    const r = rankWerkstaetten([base({ id: 'voll', faehigkeiten: [] })], ORIGIN_KOELN, 'karosserie')
    expect(r[0].passt).toBe(true)
  })
  it('kategorie nicht in faehigkeiten -> passt=false, hinter passenden', () => {
    const glas = base({ id: 'glas', faehigkeiten: ['glas'], lat: 50.94, lng: 6.96 })
    const voll = base({ id: 'voll', faehigkeiten: ['karosserie', 'lackierung'], lat: 51.2, lng: 6.8 })
    const r = rankWerkstaetten([glas, voll], ORIGIN_KOELN, 'karosserie')
    expect(r.map((x) => x.id)).toEqual(['voll', 'glas'])
    expect(r.find((x) => x.id === 'glas')!.passt).toBe(false)
  })
  it('alle unpassend -> Liste trotzdem nicht leer', () => {
    const r = rankWerkstaetten([base({ id: 'glas', faehigkeiten: ['glas'] })], ORIGIN_KOELN, 'karosserie')
    expect(r).toHaveLength(1)
    expect(r[0].passt).toBe(false)
  })
  it("kategorie 'unbekannt' -> kein Filter (alle passt=true)", () => {
    const r = rankWerkstaetten([base({ id: 'glas', faehigkeiten: ['glas'] })], ORIGIN_KOELN, 'unbekannt')
    expect(r[0].passt).toBe(true)
  })
})
