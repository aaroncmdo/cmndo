import { describe, it, expect } from 'vitest'
import { normalizeGraphUtc } from '../sync-to-cache'

describe('normalizeGraphUtc', () => {
  it('Graph-dateTime ohne Z (7 Nachkommastellen) → UTC-ISO mit Z (ms gekappt)', () => {
    expect(normalizeGraphUtc('2026-07-10T08:00:00.0000000')).toBe('2026-07-10T08:00:00.000Z')
  })
  it('bereits mit Z → valides ISO', () => {
    expect(normalizeGraphUtc('2026-07-10T08:00:00Z')).toBe('2026-07-10T08:00:00.000Z')
  })
  it('leer/undefined/ungültig → \'\'', () => {
    expect(normalizeGraphUtc('')).toBe('')
    expect(normalizeGraphUtc(undefined)).toBe('')
    expect(normalizeGraphUtc('nonsense')).toBe('')
  })
})
