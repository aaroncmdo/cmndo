import { describe, it, expect } from 'vitest'
import { resolveWunschterminIso } from './wunschtermin'

describe('resolveWunschterminIso', () => {
  it('Sommerzeit (CEST, +2h): 09:00 Berlin -> 07:00Z', () => {
    expect(resolveWunschterminIso('2026-06-03T09:00')).toBe('2026-06-03T07:00:00.000Z')
  })
  it('Winterzeit (CET, +1h): 09:00 Berlin -> 08:00Z', () => {
    expect(resolveWunschterminIso('2026-01-15T09:00')).toBe('2026-01-15T08:00:00.000Z')
  })
  it('leerer String -> null', () => {
    expect(resolveWunschterminIso('')).toBeNull()
  })
  it('null -> null', () => {
    expect(resolveWunschterminIso(null)).toBeNull()
  })
  it('undefined -> null', () => {
    expect(resolveWunschterminIso(undefined)).toBeNull()
  })
  it('ungueltiger String -> null (wirft nicht)', () => {
    expect(resolveWunschterminIso('quatsch')).toBeNull()
  })
})
