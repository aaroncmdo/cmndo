import { describe, it, expect } from 'vitest'
import { kannGutachtenAbgeben } from './abgabe-berechtigung'

// Filmcheck-Audit 29.06.2026: gutachtenAbgeben advanced jetzt die Phase (setzt das
// gutachten-Signal + checkFallAutoPhase) -> die Action wird maechtiger und braucht ein
// Ownership-Gate. Erlaubt: der SV DIESES Auftrags + admin/KB. Sonst niemand.

describe('kannGutachtenAbgeben', () => {
  it('admin + kundenbetreuer duerfen immer', () => {
    expect(kannGutachtenAbgeben({ rolle: 'admin', eigeneSvId: null, auftragSvId: 'sv-1' })).toBe(true)
    expect(kannGutachtenAbgeben({ rolle: 'kundenbetreuer', eigeneSvId: null, auftragSvId: 'sv-1' })).toBe(true)
  })

  it('SV darf nur den eigenen Auftrag abgeben', () => {
    expect(kannGutachtenAbgeben({ rolle: 'sachverstaendiger', eigeneSvId: 'sv-1', auftragSvId: 'sv-1' })).toBe(true)
  })

  it('SV mit fremdem Auftrag -> nein', () => {
    expect(kannGutachtenAbgeben({ rolle: 'sachverstaendiger', eigeneSvId: 'sv-2', auftragSvId: 'sv-1' })).toBe(false)
  })

  it('SV ohne aufloesbare eigene SV-Id -> nein', () => {
    expect(kannGutachtenAbgeben({ rolle: 'sachverstaendiger', eigeneSvId: null, auftragSvId: 'sv-1' })).toBe(false)
    expect(kannGutachtenAbgeben({ rolle: 'sachverstaendiger', eigeneSvId: 'sv-1', auftragSvId: null })).toBe(false)
  })

  it('andere Rollen + null -> nein', () => {
    expect(kannGutachtenAbgeben({ rolle: 'kunde', eigeneSvId: 'sv-1', auftragSvId: 'sv-1' })).toBe(false)
    expect(kannGutachtenAbgeben({ rolle: 'makler', eigeneSvId: 'sv-1', auftragSvId: 'sv-1' })).toBe(false)
    expect(kannGutachtenAbgeben({ rolle: null, eigeneSvId: 'sv-1', auftragSvId: 'sv-1' })).toBe(false)
  })
})
