import { describe, it, expect } from 'vitest'
import { computeKorrekturBetraege } from './partner-gutschrift-korrektur'

describe('computeKorrekturBetraege', () => {
  it('recompute default (regelbesteuert 19%)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 19, ustBetragCent: 1900, bruttoCent: 11900 } })
  })

  it('recompute default (Kleinunternehmer §19 -> 0%)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: true })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 0, ustBetragCent: 0, bruttoCent: 10000 } })
  })

  it('blockt wenn USt-Status unbekannt und kein ust_satz-Override', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: null })
    expect(r.ok).toBe(false)
  })

  it('Override netto -> USt neu abgeleitet', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false, override: { nettoCent: 20000 } })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 20000, ustSatz: 19, ustBetragCent: 3800, bruttoCent: 23800 } })
  })

  it('Override ust_satz gewinnt (auch wenn Status unbekannt)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: null, override: { ustSatz: 7 } })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 7, ustBetragCent: 700, bruttoCent: 10700 } })
  })

  it('Rundung: netto 33,33 * 19% = 6,33', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 33.33, istKleinunternehmer: false })
    expect(r.ok && r.betraege).toEqual({ nettoCent: 3333, ustSatz: 19, ustBetragCent: 633, bruttoCent: 3966 })
  })

  it('negativer netto-Override wird abgelehnt', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false, override: { nettoCent: -1 } })
    expect(r.ok).toBe(false)
  })
})
