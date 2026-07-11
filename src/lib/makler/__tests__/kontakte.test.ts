import { describe, it, expect } from 'vitest'
import {
  pickSingle,
  buildKanzleiKontakt,
  svDisplayName,
  mergeKundeIdentity,
} from '../kontakte'

describe('pickSingle', () => {
  it('array -> first element', () => expect(pickSingle([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 }))
  it('object -> itself', () => expect(pickSingle({ a: 1 })).toEqual({ a: 1 }))
  it('null/undefined -> null', () => {
    expect(pickSingle(null)).toBeNull()
    expect(pickSingle(undefined)).toBeNull()
  })
  it('empty array -> null', () => expect(pickSingle([])).toBeNull())
})

describe('buildKanzleiKontakt', () => {
  it('name present -> person, name in vorname', () => {
    expect(buildKanzleiKontakt('Kanzlei Meier', 'k@m.de', '0221')).toEqual({
      vorname: 'Kanzlei Meier', nachname: null, email: 'k@m.de', telefon: '0221',
    })
  })
  it('empty/whitespace/null name -> null', () => {
    expect(buildKanzleiKontakt('', 'x', 'y')).toBeNull()
    expect(buildKanzleiKontakt('   ', null, null)).toBeNull()
    expect(buildKanzleiKontakt(null, 'x', 'y')).toBeNull()
  })
})

describe('svDisplayName', () => {
  it('anzeigename wins', () =>
    expect(svDisplayName({ anzeigename: 'Kfz Rheinufer', vorname: 'A', nachname: 'B' }))
      .toEqual({ vorname: 'Kfz Rheinufer', nachname: null }))
  it('falls back to vorname/nachname', () =>
    expect(svDisplayName({ anzeigename: null, vorname: 'Dr.', nachname: 'Klein' }))
      .toEqual({ vorname: 'Dr.', nachname: 'Klein' }))
  it('null -> nulls', () => expect(svDisplayName(null)).toEqual({ vorname: null, nachname: null }))
})

describe('mergeKundeIdentity', () => {
  const profil = { id: 'p1', vorname: 'Max', nachname: 'Muster', email: 'max@x.de', telefon: '0221', adresse: 'Weg 1', plz: '50667', ort: 'Köln' }
  const lead = { vorname: 'Lead', nachname: 'Name', telefon: '0170', email: 'lead@x.de' }

  it('full profil + vollzugriff -> full contact', () => {
    expect(mergeKundeIdentity(profil, null, true)).toEqual(profil)
  })
  it('profil ohne Name -> Lead-Name (Enrichment)', () => {
    const noName = { id: 'p1', vorname: null, nachname: null, email: null, telefon: null, adresse: null, plz: null, ort: null }
    const r = mergeKundeIdentity(noName, lead, true)
    expect(r?.vorname).toBe('Lead')
    expect(r?.nachname).toBe('Name')
    expect(r?.id).toBe('p1')
  })
  it('kein Profil + Lead -> Lead-Identitaet, id null', () => {
    const r = mergeKundeIdentity(null, lead, true)
    expect(r).toEqual({ id: null, vorname: 'Lead', nachname: 'Name', email: 'lead@x.de', telefon: '0170', adresse: null, plz: null, ort: null })
  })
  it('minimal (full=false) -> nur Name, Kontakt genullt', () => {
    const r = mergeKundeIdentity(profil, null, false)
    expect(r).toEqual({ id: 'p1', vorname: 'Max', nachname: 'Muster', email: null, telefon: null, adresse: null, plz: null, ort: null })
  })
  it('beide null -> null', () => expect(mergeKundeIdentity(null, null, true)).toBeNull())
})
