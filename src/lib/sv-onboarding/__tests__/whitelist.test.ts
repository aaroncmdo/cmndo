import { describe, it, expect } from 'vitest'
import { filterAufWhitelist } from '../save-step'
describe('filterAufWhitelist', () => {
  it('lässt erlaubte Spalten durch, droppt privilegierte', () => {
    const { sv, profile, dropped } = filterAufWhitelist([
      { tabelle: 'sachverstaendige', spalte: 'bvsk_mitgliedsnummer', value: 'X' },
      { tabelle: 'sachverstaendige', spalte: 'paket', value: 'premium' },
      { tabelle: 'profiles', spalte: 'profilbeschreibung', value: 'Hi' },
      { tabelle: 'profiles', spalte: 'rolle', value: 'admin' },
    ])
    expect(sv).toEqual({ bvsk_mitgliedsnummer: 'X' })
    expect(profile).toEqual({ profilbeschreibung: 'Hi' })
    expect(dropped).toEqual(expect.arrayContaining(['sachverstaendige.paket', 'profiles.rolle']))
  })
})
