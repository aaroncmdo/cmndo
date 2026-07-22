import { describe, it, expect } from 'vitest'
import { PFLICHT_PERSPEKTIVEN, alleErfasst, badgeAmpel } from './zustand-perspektiven'

describe('zustand-perspektiven', () => {
  it('Pflicht-Perspektiven = 8 (4 Seiten + 4 Ecken); Tacho optional', () => {
    expect(PFLICHT_PERSPEKTIVEN).toEqual([
      'front', 'heck', 'seite_links', 'seite_rechts', 'ecke_vl', 'ecke_vr', 'ecke_hl', 'ecke_hr',
    ])
  })
  it('alleErfasst = true nur wenn jede Pflicht-Perspektive ein Foto hat', () => {
    expect(
      alleErfasst(['front', 'heck', 'seite_links', 'seite_rechts', 'ecke_vl', 'ecke_vr', 'ecke_hl', 'ecke_hr']),
    ).toBe(true)
    expect(alleErfasst(['front', 'heck'])).toBe(false)
    expect(
      alleErfasst(['front', 'heck', 'seite_links', 'seite_rechts', 'ecke_vl', 'ecke_vr', 'ecke_hl', 'ecke_hr', 'tacho']),
    ).toBe(true)
  })
  it('badgeAmpel: <3 Mon gruen, 3-6 amber, >6/nie rot', () => {
    expect(badgeAmpel(0)).toBe('gruen')
    expect(badgeAmpel(2)).toBe('gruen')
    expect(badgeAmpel(3)).toBe('amber')
    expect(badgeAmpel(6)).toBe('amber')
    expect(badgeAmpel(7)).toBe('rot')
    expect(badgeAmpel(null)).toBe('rot')
  })
})
