import { describe, it, expect } from 'vitest'
import { shouldSkipAdvance } from './should-skip-advance'

describe('shouldSkipAdvance (CAS invariant)', () => {
  it('no guard requested (undefined expected) -> never skip', () => {
    expect(shouldSkipAdvance('t1', undefined)).toBe(false)
    expect(shouldSkipAdvance(null, undefined)).toBe(false)
  })
  it('session still on the completing termin -> do NOT skip (advance runs)', () => {
    expect(shouldSkipAdvance('t1', 't1')).toBe(false)
  })
  it('session already advanced past it -> SKIP (no double advance)', () => {
    expect(shouldSkipAdvance('t2', 't1')).toBe(true)
  })
  it('session finished (aktueller_termin_id null) -> SKIP', () => {
    expect(shouldSkipAdvance(null, 't1')).toBe(true)
  })
})
