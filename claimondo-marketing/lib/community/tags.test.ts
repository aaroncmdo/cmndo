import { describe, it, expect } from 'vitest'
import { B2B_TAGS, isValidTag } from './tags'

describe('B2B_TAGS', () => {
  it('exports a non-empty array', () => {
    expect(B2B_TAGS.length).toBeGreaterThan(0)
  })
})

describe('isValidTag', () => {
  it('returns true for every known tag', () => {
    for (const tag of B2B_TAGS) {
      expect(isValidTag(tag)).toBe(true)
    }
  })

  it('returns false for unknown tags', () => {
    expect(isValidTag('UnbekannterTag')).toBe(false)
    expect(isValidTag('')).toBe(false)
    expect(isValidTag('schadenregulierung')).toBe(false) // case-sensitive
    expect(isValidTag('Recht')).toBe(false) // partial match must not succeed
  })
})
