import { describe, it, expect } from 'vitest'
import { deriveFinderVisibility } from './visibility'

const sichtbar = {
  verifiziert: true,
  ist_aktiv: true,
  hatIsochrone: true,
  standort_lat: 51.0,
  standort_lng: 7.0,
  firmenname: 'Ingenieurbüro Echt',
}

describe('deriveFinderVisibility', () => {
  it('alle Gates erfuellt -> sichtbar', () => {
    expect(deriveFinderVisibility(sichtbar)).toEqual({ visible: true })
  })

  it('nicht verifiziert', () => {
    expect(deriveFinderVisibility({ ...sichtbar, verifiziert: false })).toEqual({
      visible: false,
      reason: 'nicht-verifiziert',
    })
  })

  it('nicht aktiv', () => {
    expect(deriveFinderVisibility({ ...sichtbar, ist_aktiv: false })).toEqual({
      visible: false,
      reason: 'nicht-aktiv',
    })
  })

  it('keine Isochrone berechnet', () => {
    expect(deriveFinderVisibility({ ...sichtbar, hatIsochrone: false })).toEqual({
      visible: false,
      reason: 'keine-isochrone',
    })
  })

  it('kein Standort', () => {
    expect(deriveFinderVisibility({ ...sichtbar, standort_lat: null })).toEqual({
      visible: false,
      reason: 'kein-standort',
    })
  })

  it('Test-/Demo-/Smoke-Firmenname wird gefiltert', () => {
    expect(deriveFinderVisibility({ ...sichtbar, firmenname: 'Claimondo Test' }).reason).toBe('test-name')
    expect(deriveFinderVisibility({ ...sichtbar, firmenname: 'Smoke SV' }).reason).toBe('test-name')
    expect(deriveFinderVisibility({ ...sichtbar, firmenname: 'Demo GmbH' }).reason).toBe('test-name')
    // 'test' nur als Wort-Token — 'Testarossa Gutachten' hat kein \btest\b-Wort? Doch (Wortgrenze am Anfang).
    // Aber ein echter Name ohne test/smoke/demo bleibt sichtbar:
    expect(deriveFinderVisibility({ ...sichtbar, firmenname: 'Kontest Sachverständige' }).visible).toBe(true)
  })

  it('Prioritaet: erster fehlschlagender Gate gewinnt (verifiziert vor aktiv)', () => {
    expect(
      deriveFinderVisibility({ ...sichtbar, verifiziert: false, ist_aktiv: false }).reason,
    ).toBe('nicht-verifiziert')
  })
})
