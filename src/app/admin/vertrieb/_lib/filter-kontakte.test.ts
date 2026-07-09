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
  k({ name: 'Zeta Gutachter', kind: 'sv', stufe: 'aktiv', ort: 'Köln' }),
  k({ name: 'Alpha Makler', kind: 'makler', stufe: 'onboarding', email: 'a@makler.de' }),
  k({ name: 'Beta Werkstatt', kind: 'werkstatt', stufe: 'aktiv', ort: 'Bonn' }),
]

describe('filterKontakte', () => {
  it('seg filtert nach kind', () => {
    expect(filterKontakte(daten, { seg: 'sv', search: '', stufe: 'alle' })).toHaveLength(1)
    expect(filterKontakte(daten, { seg: 'alle', search: '', stufe: 'alle' })).toHaveLength(3)
  })
  it('stufe filtert', () => {
    expect(filterKontakte(daten, { seg: 'alle', search: '', stufe: 'aktiv' }).map((x) => x.name)).toEqual(['Beta Werkstatt', 'Zeta Gutachter'])
  })
  it('search matcht Name/Ort/Email (case-insensitive)', () => {
    expect(filterKontakte(daten, { seg: 'alle', search: 'köln', stufe: 'alle' }).map((x) => x.name)).toEqual(['Zeta Gutachter'])
    expect(filterKontakte(daten, { seg: 'alle', search: 'makler.de', stufe: 'alle' }).map((x) => x.name)).toEqual(['Alpha Makler'])
  })
  it('sortiert alphabetisch nach Name', () => {
    expect(filterKontakte(daten, { seg: 'alle', search: '', stufe: 'alle' }).map((x) => x.name)).toEqual(['Alpha Makler', 'Beta Werkstatt', 'Zeta Gutachter'])
  })
})
