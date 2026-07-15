import { describe, it, expect } from 'vitest'
import {
  fahrzeugtypZuEuKlasse,
  manuelleGewerkeZuBedarf,
  kannWeiter,
  wizardStateZuSuche,
  WIZARD_INITIAL,
  FAHRZEUGTYP_OPTIONEN,
  type WerkstattWizardState,
} from '../wizard-logic'

describe('fahrzeugtypZuEuKlasse', () => {
  it('mappt jeden Typ auf seine repräsentative EU-Klasse', () => {
    expect(fahrzeugtypZuEuKlasse('pkw')).toBe('M1')
    expect(fahrzeugtypZuEuKlasse('transporter')).toBe('N1')
    expect(fahrzeugtypZuEuKlasse('lkw')).toBe('N2')
    expect(fahrzeugtypZuEuKlasse('motorrad')).toBe('L3e')
    expect(fahrzeugtypZuEuKlasse('anhaenger')).toBe('O2')
  })
  it('FAHRZEUGTYP_OPTIONEN hat PKW als erste (Default) Option', () => {
    expect(FAHRZEUGTYP_OPTIONEN[0].wert).toBe('pkw')
  })
})

describe('manuelleGewerkeZuBedarf', () => {
  it('quelle=manuell, confidence 70 bei Auswahl, filtert Nicht-Gewerke', () => {
    const b = manuelleGewerkeZuBedarf(['karosserie', 'quatsch' as never, 'lackierung'])
    expect(b.kategorien).toEqual(['karosserie', 'lackierung'])
    expect(b.quelle).toBe('manuell')
    expect(b.confidence).toBe(70)
  })
  it('leere Auswahl → confidence 0', () => {
    expect(manuelleGewerkeZuBedarf([])).toEqual({ kategorien: [], quelle: 'manuell', confidence: 0 })
  })
})

describe('kannWeiter', () => {
  it('standort: nur mit gesetztem Standort', () => {
    expect(kannWeiter('standort', WIZARD_INITIAL)).toBe(false)
    expect(kannWeiter('standort', { ...WIZARD_INITIAL, standort: { adresse: 'x', lat: 1, lng: 2 } })).toBe(true)
  })
  it('fahrzeug: nur mit Hersteller', () => {
    expect(kannWeiter('fahrzeug', WIZARD_INITIAL)).toBe(false)
    expect(kannWeiter('fahrzeug', { ...WIZARD_INITIAL, hersteller: 'BMW' })).toBe(true)
  })
  it('schaden: nur mit Bedarf-Kategorien', () => {
    expect(kannWeiter('schaden', WIZARD_INITIAL)).toBe(false)
    expect(
      kannWeiter('schaden', { ...WIZARD_INITIAL, bedarf: { kategorien: ['glas'], quelle: 'manuell', confidence: 70 } }),
    ).toBe(true)
  })
})

describe('wizardStateZuSuche', () => {
  it('setzt lat/lng aus standort, marke aus hersteller, fahrzeugklasse aus typ', () => {
    const s: WerkstattWizardState = {
      ...WIZARD_INITIAL,
      standort: { adresse: 'Köln', lat: 50.9, lng: 6.9 },
      hersteller: '  BMW  ',
      fahrzeugtyp: 'motorrad',
      bedarf: { kategorien: ['mechanik'], quelle: 'manuell', confidence: 70 },
    }
    const r = wizardStateZuSuche(s)
    expect(r.lat).toBe(50.9)
    expect(r.lng).toBe(6.9)
    expect(r.marke).toBe('BMW')
    expect(r.fahrzeugklasse).toBe('L3e')
    expect(r.bedarf?.kategorien).toEqual(['mechanik'])
  })
  it('leerer Hersteller → marke null', () => {
    expect(wizardStateZuSuche(WIZARD_INITIAL).marke).toBeNull()
  })
})
