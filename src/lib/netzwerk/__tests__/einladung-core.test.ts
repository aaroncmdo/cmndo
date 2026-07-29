import { describe, it, expect } from 'vitest'
import { generateEinladungToken, istEinloesbar, ROLLE_TO_REGISTRIER_PFAD } from '../einladung-core'

describe('generateEinladungToken', () => {
  it('liefert Token + sha256-hex-Hash + 8-Zeichen-Prefix', () => {
    const t = generateEinladungToken()
    expect(t.token.length).toBeGreaterThan(0)
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(t.lookupPrefix).toBe(t.token.slice(0, 8))
  })
  it('zwei Aufrufe unterscheiden sich', () => {
    expect(generateEinladungToken().token).not.toBe(generateEinladungToken().token)
  })
})

describe('istEinloesbar', () => {
  const jetzt = new Date('2026-07-28T00:00:00Z')
  it('offen + nicht abgelaufen = true', () => {
    expect(istEinloesbar({ status: 'offen', ablauf_am: '2026-08-01T00:00:00Z' }, jetzt)).toBe(true)
  })
  it('abgelaufen = false', () => {
    expect(istEinloesbar({ status: 'offen', ablauf_am: '2026-07-01T00:00:00Z' }, jetzt)).toBe(false)
  })
  it('bereits eingeloest = false', () => {
    expect(istEinloesbar({ status: 'eingeloest', ablauf_am: '2999-01-01T00:00:00Z' }, jetzt)).toBe(false)
  })
})

describe('ROLLE_TO_REGISTRIER_PFAD', () => {
  it('sv->/sv, werkstatt->/werkstatt, makler->/makler', () => {
    expect(ROLLE_TO_REGISTRIER_PFAD.sachverstaendiger).toBe('/sv/registrieren')
    expect(ROLLE_TO_REGISTRIER_PFAD.werkstatt).toBe('/werkstatt/registrieren')
    expect(ROLLE_TO_REGISTRIER_PFAD.makler).toBe('/makler/registrieren')
  })
})
