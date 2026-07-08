import { describe, it, expect } from 'vitest'
import { computeProvisionUst } from './partner-billing-ust'

describe('computeProvisionUst', () => {
  it('regelbesteuert -> 19% Aufschlag', () => {
    expect(computeProvisionUst(100, false)).toEqual({ ustSatz: 19, ustBetrag: 19, brutto: 119, bekannt: true })
  })
  it('Kleinunternehmer -> keine USt', () => {
    expect(computeProvisionUst(100, true)).toEqual({ ustSatz: 0, ustBetrag: 0, brutto: 100, bekannt: true })
  })
  it('unbekannt (null) -> nichts berechnet, bekannt=false', () => {
    expect(computeProvisionUst(100, null)).toEqual({ ustSatz: null, ustBetrag: null, brutto: null, bekannt: false })
  })
  it('rundet auf 2 Nachkommastellen', () => {
    expect(computeProvisionUst(33.33, false)).toEqual({ ustSatz: 19, ustBetrag: 6.33, brutto: 39.66, bekannt: true })
  })
})
