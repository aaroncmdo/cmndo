import { describe, it, expect } from 'vitest'
import { validateUsername } from './username'

describe('validateUsername', () => {
  it('akzeptiert einen gültigen Namen', () => {
    const r = validateUsername('max_99')
    expect(r.ok).toBe(true)
  })
  it('normalisiert zu lowercase + trim', () => {
    const r = validateUsername('  Max_99 ')
    expect(r).toEqual({ ok: true, username: 'max_99' })
  })
  it('lehnt zu kurze Namen ab (<3)', () => {
    expect(validateUsername('ab').ok).toBe(false)
  })
  it('lehnt zu lange Namen ab (>24)', () => {
    expect(validateUsername('a'.repeat(25)).ok).toBe(false)
  })
  it('lehnt ungültige Zeichen ab', () => {
    expect(validateUsername('max!99').ok).toBe(false)
    expect(validateUsername('max 99').ok).toBe(false)
  })
  it('lehnt reservierte Namen ab (case-insensitive)', () => {
    expect(validateUsername('admin').ok).toBe(false)
    expect(validateUsername('Claimondo').ok).toBe(false)
  })
})
