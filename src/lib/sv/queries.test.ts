import { describe, it, expect } from 'vitest'
import { applyDispatchableFilter } from './queries'

// Gutachter-Onboarding-Audit (Befund #1): Die Karte gated auf `verifiziert`,
// Dispatch/MCP-Buchung gateten NUR auf portal_zugang -> ein bezahlter-aber-
// unverifizierter SV war dispatchbar/buchbar, aber NICHT als Karten-Pin sichtbar.
// Vereinheitlicht: Dispatch verlangt jetzt ZUSÄTZLICH verifiziert=true, sodass
// "gelistet auf der Karte" == "buchbar durch die Engine" gilt.

function makeBuilder() {
  const calls: Array<[string, string, unknown]> = []
  const b = {
    eq: (col: string, val: unknown) => {
      calls.push(['eq', col, val])
      return b
    },
    is: (col: string, val: unknown) => {
      calls.push(['is', col, val])
      return b
    },
    calls,
  }
  return b
}

describe('applyDispatchableFilter', () => {
  it('verlangt verifiziert=true (Angleich ans Karten-Gate)', () => {
    const b = makeBuilder()
    applyDispatchableFilter(b)
    expect(b.calls).toContainEqual(['eq', 'verifiziert', true])
  })

  it('behält die bestehenden Dispatch-Gates (ist_aktiv/portal/gesperrt/geloescht)', () => {
    const b = makeBuilder()
    applyDispatchableFilter(b)
    expect(b.calls).toContainEqual(['eq', 'ist_aktiv', true])
    expect(b.calls).toContainEqual(['eq', 'portal_zugang_freigeschaltet', true])
    expect(b.calls).toContainEqual(['is', 'gesperrt_seit', null])
    expect(b.calls).toContainEqual(['is', 'geloescht_am', null])
  })
})
