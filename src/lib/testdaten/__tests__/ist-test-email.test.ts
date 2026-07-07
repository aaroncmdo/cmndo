import { describe, it, expect } from 'vitest'
import { istTestEmail } from '../ist-test-email'

describe('istTestEmail', () => {
  it('erkennt test/smoke/@claimondo.test', () => {
    expect(istTestEmail('test@x.de')).toBe(true)
    expect(istTestEmail('smoke.run@y.de')).toBe(true)
    expect(istTestEmail('jemand@claimondo.test')).toBe(true)
    expect(istTestEmail('MaxTest@web.de')).toBe(true) // case-insensitive
  })
  it('lässt echte Emails durch', () => {
    expect(istTestEmail('max.mustermann@gmail.com')).toBe(false)
    expect(istTestEmail('kunde@claimondo.de')).toBe(false)
  })
  it('ist null/undefined/leer-sicher', () => {
    expect(istTestEmail(null)).toBe(false)
    expect(istTestEmail(undefined)).toBe(false)
    expect(istTestEmail('')).toBe(false)
  })
})
