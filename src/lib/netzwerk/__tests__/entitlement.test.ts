import { describe, it, expect } from 'vitest'
import { istAktivesAbo } from '../entitlement'

describe('istAktivesAbo (pure)', () => {
  const now = new Date('2026-07-28T00:00:00Z')
  it('aktiv + gueltig_bis in Zukunft = true', () => {
    expect(istAktivesAbo({ status: 'aktiv', gueltig_bis: '2026-08-28T00:00:00Z' }, now)).toBe(true)
  })
  it('comped (Bestand) = true, auch ohne gueltig_bis', () => {
    expect(istAktivesAbo({ status: 'comped', gueltig_bis: null }, now)).toBe(true)
  })
  it('aktiv aber abgelaufen = false', () => {
    expect(istAktivesAbo({ status: 'aktiv', gueltig_bis: '2026-07-01T00:00:00Z' }, now)).toBe(false)
  })
  it('ueberfaellig/gekuendigt/inaktiv = false', () => {
    for (const s of ['ueberfaellig', 'gekuendigt', 'inaktiv'] as const)
      expect(istAktivesAbo({ status: s, gueltig_bis: '2999-01-01T00:00:00Z' }, now)).toBe(false)
  })
})
