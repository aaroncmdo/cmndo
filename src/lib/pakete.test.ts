import { describe, it, expect } from 'vitest'
import { getPaket, getPaketLabel, PAKETE, BASIC_PAKET } from './pakete'

describe('getPaket — die drei bezahlten Pakete + Aliase', () => {
  it('mappt standard/pro/premium inkl. Alt-Aliase', () => {
    expect(getPaket('standard')).toBe(PAKETE.standard)
    expect(getPaket('starter-10')).toBe(PAKETE.standard)
    expect(getPaket('starter')).toBe(PAKETE.standard)
    expect(getPaket('pro')).toBe(PAKETE.pro)
    expect(getPaket('standard-25')).toBe(PAKETE.pro)
    expect(getPaket('premium')).toBe(PAKETE.premium)
    expect(getPaket('premium-50')).toBe(PAKETE.premium)
  })

  it('faellt fuer unbekannte Keys auf Standard zurueck', () => {
    expect(getPaket('quatsch')).toBe(PAKETE.standard)
    expect(getPaket('individuell')).toBe(PAKETE.standard)
  })
})

describe('getPaket — basic (Pay-per-Lead)', () => {
  it('liefert den Basic-Deskriptor, NICHT den Standard-Fallback', () => {
    const p = getPaket('basic')
    expect(p).toBe(BASIC_PAKET)
    expect(p.name).toBe('Basic')
    expect(p.faelle).toBe(0) // keine Inklusivfaelle -> pro-Lead-Billing
    expect(p.preis).toBe(0) // keine Anzahlung
    expect(p.anzahlung).toBe(0)
    expect(p.radius_km).toBe(25) // == BASIC_DEFAULT_RADIUS_KM
  })
})

describe('getPaketLabel', () => {
  it('labelt basic als "Basic" statt "Standard"', () => {
    expect(getPaketLabel('basic')).toBe('Basic')
  })
  it('labelt die bezahlten Pakete korrekt', () => {
    expect(getPaketLabel('pro')).toBe('Pro')
    expect(getPaketLabel('premium-50')).toBe('Premium')
  })
})
