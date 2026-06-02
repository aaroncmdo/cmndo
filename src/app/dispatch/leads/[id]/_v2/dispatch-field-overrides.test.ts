import { describe, it, expect } from 'vitest'
import {
  hasDispatchFieldOverride,
  DISPATCH_FIELD_OVERRIDE_KEYS,
} from './dispatch-field-override-keys'

describe('dispatch field overrides (P2d-1/P2d-2)', () => {
  it('Dispatcher-Override-Felder rendern Rich-Komponenten', () => {
    expect(hasDispatchFieldOverride('termin')).toBe(true) // SvDispatchPanel
    expect(hasDispatchFieldOverride('gegner_versicherung')).toBe(true) // VersicherungAutocomplete
    expect(hasDispatchFieldOverride('besichtigungsort_adresse')).toBe(true) // GooglePlaceAutocomplete
    expect(hasDispatchFieldOverride('unfallort')).toBe(true) // GooglePlaceAutocomplete
    expect(hasDispatchFieldOverride('kennzeichen')).toBe(true) // KennzeichenPartsInput (P2d-2b)
  })

  it('normale Felder haben KEIN Override -> Fallback auf FieldRenderer', () => {
    expect(hasDispatchFieldOverride('vorname')).toBe(false)
    expect(hasDispatchFieldOverride('schadentyp')).toBe(false)
    // gegner_kennzeichen bleibt Freitext — leads hat keine Parts-Spalten dafür (P2d-2b)
    expect(hasDispatchFieldOverride('gegner_kennzeichen')).toBe(false)
  })

  it('Override-Keys sind eindeutig', () => {
    expect(new Set(DISPATCH_FIELD_OVERRIDE_KEYS).size).toBe(DISPATCH_FIELD_OVERRIDE_KEYS.length)
  })
})
