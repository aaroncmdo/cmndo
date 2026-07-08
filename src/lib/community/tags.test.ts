import { describe, it, expect } from 'vitest'
import { B2B_TAGS, isValidTag } from './tags'

describe('tags', () => {
  it('enthält die 7 B2B-Tags', () => {
    expect(B2B_TAGS).toContain('Recht & Urteile')
    expect(B2B_TAGS).toHaveLength(7)
  })
  it('isValidTag akzeptiert gültige und lehnt ungültige ab', () => {
    expect(isValidTag('Gutachten')).toBe(true)
    expect(isValidTag('Quatsch')).toBe(false)
  })
})
