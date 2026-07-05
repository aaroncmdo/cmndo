import { describe, it, expect, beforeAll } from 'vitest'
import {
  signWochenreportOptOut,
  verifyWochenreportOptOut,
  wochenreportOptOutUrl,
} from '../wochenreport-optout'

beforeAll(() => {
  process.env.START_LINK_HMAC_SECRET = 'test-secret-wochenreport'
})

describe('wochenreport-optout Token', () => {
  const id = 'makler-abc-123'

  it('sign → verify Round-Trip', () => {
    const sig = signWochenreportOptOut(id)
    expect(sig).toBeTruthy()
    expect(verifyWochenreportOptOut(id, sig)).toBe(true)
  })

  it('verwirft eine falsche Signatur', () => {
    expect(verifyWochenreportOptOut(id, 'deadbeef')).toBe(false)
  })

  it('verwirft die Signatur eines ANDEREN Maklers (kein Cross-Opt-out)', () => {
    const fremd = signWochenreportOptOut('makler-other')
    expect(verifyWochenreportOptOut(id, fremd)).toBe(false)
  })

  it('verwirft null / leer', () => {
    expect(verifyWochenreportOptOut(id, null)).toBe(false)
    expect(verifyWochenreportOptOut(id, '')).toBe(false)
    expect(verifyWochenreportOptOut('', signWochenreportOptOut(id))).toBe(false)
  })

  it('URL enthaelt maklerId, sig + Abmelde-Pfad', () => {
    const url = wochenreportOptOutUrl(id)
    expect(url).toContain('/abmelden/makler-wochenreport/makler-abc-123')
    expect(url).toContain('sig=')
  })
})
