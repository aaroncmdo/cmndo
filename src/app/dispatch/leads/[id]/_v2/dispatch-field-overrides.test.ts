import { describe, it, expect } from 'vitest'
import {
  hasDispatchFieldOverride,
  DISPATCH_FIELD_OVERRIDE_KEYS,
} from './dispatch-field-override-keys'

describe('dispatch field overrides (P2d-1)', () => {
  it('termin-Feld hat ein Dispatcher-Override (SvDispatchPanel statt TerminField)', () => {
    expect(hasDispatchFieldOverride('termin')).toBe(true)
  })

  it('normale Felder haben KEIN Override -> Fallback auf FieldRenderer', () => {
    expect(hasDispatchFieldOverride('kennzeichen')).toBe(false)
    expect(hasDispatchFieldOverride('vorname')).toBe(false)
    expect(hasDispatchFieldOverride('unfallort')).toBe(false)
  })

  it('Override-Keys sind eindeutig', () => {
    expect(new Set(DISPATCH_FIELD_OVERRIDE_KEYS).size).toBe(DISPATCH_FIELD_OVERRIDE_KEYS.length)
  })
})
