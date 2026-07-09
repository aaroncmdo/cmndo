import { describe, it, expect } from 'vitest'
import { filterKontakte } from './filter-kontakte'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

const k = (o: Partial<VertriebKontakt>): VertriebKontakt => ({
  id: Math.random().toString(36), kind: 'sv', name: 'X', email: null, telefon: null,
  plz: null, ort: null, lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null,
  roh_status: null, roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null,
  roh_portal_zugang: null, roh_onboarding_offen: null, roh_warteliste: null, notizen: null,
  stufe: 'neu', rolle: 'sv', typ: 'partner', ...o,
})

const daten: VertriebKontakt[] = [
  k({ name: 'Zeta Gutachter', kind: 'sv', typ: 'partner', rolle: 'sv', stufe: 'aktiv', ort: 'Köln' }),
  k({ name: 'Alpha Makler', kind: 'makler', typ: 'partner', rolle: 'makler', stufe: 'onboarding', email: 'a@makler.de' }),
  k({ name: 'Beta Werkstatt', kind: 'werkstatt', typ: 'partner', rolle: 'werkstatt', stufe: 'aktiv', ort: 'Bonn' }),
  k({ name: 'Gamma SV-Lead', kind: 'partner-lead', typ: 'lead', rolle: 'sv', stufe: 'neu', ort: 'Köln' }),
]

const F = { typ: 'alle', rolle: 'alle', search: '', stufe: 'alle' } as const

describe('filterKontakte (Switch-Modell)', () => {
  it('typ filtert Partner vs Lead', () => {
    expect(filterKontakte(daten, { ...F, typ: 'lead' }).map((x) => x.name)).toEqual(['Gamma SV-Lead'])
    expect(filterKontakte(daten, { ...F, typ: 'partner' })).toHaveLength(3)
    expect(filterKontakte(daten, F)).toHaveLength(4)
  })
  it('rolle filtert (typ-übergreifend)', () => {
    // Rolle SV = aktiver SV + SV-Lead
    expect(filterKontakte(daten, { ...F, rolle: 'sv' }).map((x) => x.name)).toEqual(['Gamma SV-Lead', 'Zeta Gutachter'])
    expect(filterKontakte(daten, { ...F, rolle: 'makler' }).map((x) => x.name)).toEqual(['Alpha Makler'])
  })
  it('typ + rolle kombiniert', () => {
    expect(filterKontakte(daten, { ...F, typ: 'partner', rolle: 'sv' }).map((x) => x.name)).toEqual(['Zeta Gutachter'])
  })
  it('stufe filtert', () => {
    expect(filterKontakte(daten, { ...F, stufe: 'aktiv' }).map((x) => x.name)).toEqual(['Beta Werkstatt', 'Zeta Gutachter'])
  })
  it('search matcht Name/Ort/Email (case-insensitive)', () => {
    expect(filterKontakte(daten, { ...F, search: 'makler.de' }).map((x) => x.name)).toEqual(['Alpha Makler'])
    expect(filterKontakte(daten, { ...F, search: 'köln' }).map((x) => x.name)).toEqual(['Gamma SV-Lead', 'Zeta Gutachter'])
  })
  it('sortiert alphabetisch nach Name', () => {
    expect(filterKontakte(daten, F).map((x) => x.name)).toEqual(['Alpha Makler', 'Beta Werkstatt', 'Gamma SV-Lead', 'Zeta Gutachter'])
  })
})
