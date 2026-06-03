import { describe, it, expect } from 'vitest'
import { GESPRAECHS_SEKTIONEN, EINWAENDE, DISQUALIFIKATIONS_HILFE } from './gespraech-content'

describe('gespraech-content', () => {
  it('hat alle 6 Gespraechs-Sektionen mit Opener + Folge-Punkten', () => {
    expect(GESPRAECHS_SEKTIONEN).toHaveLength(6)
    for (const s of GESPRAECHS_SEKTIONEN) {
      expect(s.titel.length).toBeGreaterThan(0)
      expect(s.opener.length).toBeGreaterThan(0)
      expect(s.folge.length).toBeGreaterThan(0)
    }
  })
  it('hat Einwand-Karten mit Einwand + Antwort', () => {
    expect(EINWAENDE.length).toBeGreaterThanOrEqual(7)
    for (const e of EINWAENDE) {
      expect(e.einwand.length).toBeGreaterThan(0)
      expect(e.antwort.length).toBeGreaterThan(0)
    }
  })
  it('hat eine Disqualifikations-Hilfe mit mind. einem Grund-Skript', () => {
    expect(DISQUALIFIKATIONS_HILFE.length).toBeGreaterThan(0)
    for (const d of DISQUALIFIKATIONS_HILFE) {
      expect(d.grund.length).toBeGreaterThan(0)
      expect(d.skript.length).toBeGreaterThan(0)
    }
  })
})
