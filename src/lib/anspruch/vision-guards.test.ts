import { describe, it, expect } from 'vitest'
import { plausibilisiereReparaturKosten, REPARATUR_MIN_FLOOR_EUR, REPARATUR_MAX_CAP_EUR } from './vision-guards'

describe('plausibilisiereReparaturKosten', () => {
  it('normale Spanne bleibt unveraendert', () => {
    expect(plausibilisiereReparaturKosten(1000, 2000)).toEqual({ min: 1000, max: 2000 })
  })

  it('invertierte Spanne (min > max) wird getauscht', () => {
    expect(plausibilisiereReparaturKosten(2000, 1000)).toEqual({ min: 1000, max: 2000 })
  })

  it('absurd hoher Wert wird auf den Cap geklemmt', () => {
    expect(plausibilisiereReparaturKosten(500_000, 800_000)).toEqual({ min: REPARATUR_MAX_CAP_EUR, max: REPARATUR_MAX_CAP_EUR })
  })

  it('nur der obere Wert absurd -> Cap oben, unten unveraendert', () => {
    expect(plausibilisiereReparaturKosten(10_000, 500_000)).toEqual({ min: 10_000, max: REPARATUR_MAX_CAP_EUR })
  })

  it('Null/zu niedrig wird auf den Floor gehoben', () => {
    expect(plausibilisiereReparaturKosten(0, 0)).toEqual({ min: REPARATUR_MIN_FLOOR_EUR, max: REPARATUR_MIN_FLOOR_EUR })
  })

  it('negative Werte werden als Betrag interpretiert + geordnet', () => {
    expect(plausibilisiereReparaturKosten(-100, -50)).toEqual({ min: 50, max: 100 })
  })

  it('NaN/Infinity faellt auf den Floor zurueck', () => {
    expect(plausibilisiereReparaturKosten(Number.NaN, 2000)).toEqual({ min: REPARATUR_MIN_FLOOR_EUR, max: 2000 })
    expect(plausibilisiereReparaturKosten(1000, Number.POSITIVE_INFINITY)).toEqual({ min: 1000, max: REPARATUR_MAX_CAP_EUR })
  })

  it('Nachkommastellen werden gerundet', () => {
    expect(plausibilisiereReparaturKosten(999.4, 1500.6)).toEqual({ min: 999, max: 1501 })
  })

  it('mini-Ausreisser oben+unten -> beide auf Floor konsistent', () => {
    expect(plausibilisiereReparaturKosten(1, 10)).toEqual({ min: REPARATUR_MIN_FLOOR_EUR, max: REPARATUR_MIN_FLOOR_EUR })
  })
})
