import { describe, it, expect } from 'vitest'
import { coerceLeadErfassungWert } from '../lead-erfassung-allowlist'

describe('coerceLeadErfassungWert', () => {
  it('leerer String und undefined werden null', () => {
    expect(coerceLeadErfassungWert('text', '')).toBeNull()
    expect(coerceLeadErfassungWert('text', undefined)).toBeNull()
  })
  it('number-Felder werden zu Number (leer = null)', () => {
    expect(coerceLeadErfassungWert('number', '2019')).toBe(2019)
    expect(coerceLeadErfassungWert('number', '  ')).toBeNull()
  })
  it('segmented true/false werden Boolean', () => {
    expect(coerceLeadErfassungWert('segmented', 'true')).toBe(true)
    expect(coerceLeadErfassungWert('segmented', 'false')).toBe(false)
  })
  it('andere Werte bleiben unveraendert', () => {
    expect(coerceLeadErfassungWert('text', 'B-MW 123')).toBe('B-MW 123')
    expect(coerceLeadErfassungWert('segmented', 'gegner')).toBe('gegner')
  })
})
