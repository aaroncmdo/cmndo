import { describe, it, expect } from 'vitest'
import { kundeHatBestaetigt } from '../onboarding-gate'

describe('kundeHatBestaetigt (P4-Gate)', () => {
  it('sa_unterschrieben=true -> true', () => {
    expect(kundeHatBestaetigt({ sa_unterschrieben: true })).toBe(true)
  })
  it('sa_unterschrieben=false -> false', () => {
    expect(kundeHatBestaetigt({ sa_unterschrieben: false })).toBe(false)
  })
  it('null/undefined -> false (konservativ)', () => {
    expect(kundeHatBestaetigt({ sa_unterschrieben: null })).toBe(false)
    expect(kundeHatBestaetigt({ sa_unterschrieben: undefined })).toBe(false)
    expect(kundeHatBestaetigt({})).toBe(false)
  })
})
