import { describe, it, expect } from 'vitest'
import {
  FORDERUNGSPOSITION_TYP_LABEL,
  KUERZBARE_POSITIONEN,
  forderungspositionTypLabel,
} from './forderungsposition-typ'

// Muss synchron zu forderungspositionen_typ_check (Migration 20260804224244) sein.
const DB_CHECK_TYP_VALUES = [
  'reparatur',
  'wertminderung',
  'nutzungsausfall',
  'mietwagen',
  'gutachterkosten',
  'abschleppkosten',
  'anwaltskosten',
  'kostenpauschale',
  'schmerzensgeld',
  'wbw',
  'restwert',
  'sonstiges',
  'stundenverrechnung',
  'upe',
  'verbringung',
  'beilackierung',
]

describe('FORDERUNGSPOSITION_TYP_LABEL', () => {
  it('hat für jeden DB-CHECK-typ-Wert ein Label (Drift-Guard)', () => {
    for (const typ of DB_CHECK_TYP_VALUES) {
      expect(FORDERUNGSPOSITION_TYP_LABEL[typ], `Label fehlt für typ '${typ}'`).toBeTruthy()
    }
  })

  it('führt keine Labels ohne DB-CHECK-Pendant (kein Extra)', () => {
    for (const typ of Object.keys(FORDERUNGSPOSITION_TYP_LABEL)) {
      expect(DB_CHECK_TYP_VALUES, `Label '${typ}' ohne CHECK-Wert`).toContain(typ)
    }
  })

  it('KUERZBARE_POSITIONEN sind alle gültige typ-Werte', () => {
    for (const typ of KUERZBARE_POSITIONEN) {
      expect(DB_CHECK_TYP_VALUES).toContain(typ)
    }
  })
})

describe('forderungspositionTypLabel', () => {
  it('mappt bekannten typ auf Label', () => {
    expect(forderungspositionTypLabel('upe')).toBe('UPE-Aufschläge')
  })
  it('fällt auf rohen Wert zurück bei unbekanntem typ', () => {
    expect(forderungspositionTypLabel('unbekannt')).toBe('unbekannt')
  })
  it('gibt Gedankenstrich bei null/undefined', () => {
    expect(forderungspositionTypLabel(null)).toBe('—')
    expect(forderungspositionTypLabel(undefined)).toBe('—')
  })
})
