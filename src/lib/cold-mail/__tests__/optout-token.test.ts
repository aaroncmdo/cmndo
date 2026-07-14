import { describe, it, expect, beforeAll } from 'vitest'
import { createOptoutToken, verifyOptoutToken } from '../optout-token'

beforeAll(() => { process.env.CRON_SECRET = 'test-secret-abc' })

describe('optout-token', () => {
  it('round-trip: verify liefert die (normalisierte) Email zurück', () => {
    const t = createOptoutToken('Info@Beispiel.DE')
    expect(verifyOptoutToken(t)).toBe('info@beispiel.de')
  })
  it('manipuliertes Token → null', () => {
    const t = createOptoutToken('a@b.de')
    expect(verifyOptoutToken(t.slice(0, -2) + 'xy')).toBeNull()
  })
  it('malformed Token → null', () => {
    expect(verifyOptoutToken('kein-punkt')).toBeNull()
    expect(verifyOptoutToken('')).toBeNull()
  })
})
