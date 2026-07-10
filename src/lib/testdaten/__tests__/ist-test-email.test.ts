import { describe, it, expect } from 'vitest'
import { istTestEmail, istTestPartner } from '../ist-test-email'

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

describe('istTestPartner', () => {
  it('erkennt Test/Smoke/Demo per Name (Wort-Grenze)', () => {
    expect(istTestPartner('Test Firmna', 'daniel@b.de')).toBe(true)
    expect(istTestPartner('Test Makler GmbH (Smoke)', null)).toBe(true)
    expect(istTestPartner('SMOKE Werkstatt (Test)', null)).toBe(true)
    expect(istTestPartner('Demo Betrieb', null)).toBe(true)
  })
  it('erkennt Test per Email', () => {
    expect(istTestPartner('Echte GmbH', 'smoke@x.de')).toBe(true)
    expect(istTestPartner(null, 'jemand@claimondo.test')).toBe(true)
  })
  it('laesst echte Partner durch — kein Substring-FP (Contest/latest/MaxTest)', () => {
    expect(istTestPartner('Contest GmbH', 'info@contest.de')).toBe(false)
    expect(istTestPartner('Latest Automotive', 'latest@web.de')).toBe(false)
    expect(istTestPartner('Daniel Bundesmann', 'daniel@bundesmann.de')).toBe(false)
    expect(istTestPartner('Auto Conen GmbH', null)).toBe(false)
  })
  it('null/undefined-sicher', () => {
    expect(istTestPartner(null, null)).toBe(false)
    expect(istTestPartner(undefined, undefined)).toBe(false)
  })
})
