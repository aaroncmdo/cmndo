import { describe, it, expect } from 'vitest'
import { entscheideTestSvGuard, istTestSvAngebotBlockiert } from './test-sv-guard'

describe('entscheideTestSvGuard — Konsistenz-Matrix (Buchungs-Chokepoint)', () => {
  it('intern → echt = BLOCK (der 03.07.-Vorfall)', () => {
    expect(entscheideTestSvGuard(true, false).blockieren).toBe(true)
  })
  it('echt → Test = BLOCK (umgekehrtes Leck)', () => {
    expect(entscheideTestSvGuard(false, true).blockieren).toBe(true)
  })
  it('intern → Test = ok (Smokes)', () => {
    expect(entscheideTestSvGuard(true, true).blockieren).toBe(false)
  })
  it('echt → echt = ok (Normalbetrieb)', () => {
    expect(entscheideTestSvGuard(false, false).blockieren).toBe(false)
  })
})

describe('istTestSvAngebotBlockiert — Angebots-Spiegel der Matrix (Fixer-Pfad, Follow-up 3)', () => {
  it('echter SV wird IMMER angeboten (Identitaet egal)', () => {
    expect(istTestSvAngebotBlockiert(false, { email: 'kunde@web.de', name: 'K Meier' })).toBe(false)
    expect(istTestSvAngebotBlockiert(false, null)).toBe(false)
    expect(istTestSvAngebotBlockiert(false, undefined)).toBe(false)
  })
  it('Test-SV + interne Identitaet (Domain) = angeboten (Smoke-Strecken)', () => {
    expect(istTestSvAngebotBlockiert(true, { email: 'smoke-embed-e2e@claimondo.test', name: null })).toBe(false)
  })
  it('Test-SV + interne Identitaet (Platzhalter-Name) = angeboten', () => {
    expect(istTestSvAngebotBlockiert(true, { email: null, name: 'Max Mustermann' })).toBe(false)
  })
  it('Test-SV + echte Identitaet = BLOCKIERT (sonst degradierte Buchung am Guard)', () => {
    expect(istTestSvAngebotBlockiert(true, { email: 'kunde@web.de', name: 'K Meier' })).toBe(true)
  })
  it('Test-SV + UNBEKANNTE Identitaet = BLOCKIERT (fail-closed Richtung Kundenschutz)', () => {
    expect(istTestSvAngebotBlockiert(true, null)).toBe(true)
    expect(istTestSvAngebotBlockiert(true, { email: null, name: null })).toBe(true)
  })
})
