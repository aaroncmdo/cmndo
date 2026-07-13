import { describe, it, expect } from 'vitest'
import { mapLeadDetail } from './lead-detail'

describe('mapLeadDetail', () => {
  it('mappt Ansprechpartner + loest erstellt_von ueber die Namens-Map auf', () => {
    const d = mapLeadDetail(
      {
        id: 'l1', status: 'kontaktiert', einstufung: 'warm', notiz: null,
        ansprechpartner_vorname: 'Tom', ansprechpartner_nachname: 'Müller',
        ansprechpartner_position: 'Inhaber', ansprechpartner_email: null, ansprechpartner_telefon: null,
      },
      [{ id: 'a1', typ: 'anruf', text: 'nicht erreicht', erstellt_von: 'u1', erstellt_am: '2026-07-10' }],
      { u1: 'Ann A' },
    )
    expect(d.ansprechpartner.position).toBe('Inhaber')
    expect(d.aktivitaeten[0].erstellt_von_name).toBe('Ann A')
    expect(d.aktivitaeten[0].typ).toBe('anruf')
  })
  it('erstellt_von_name null wenn nicht in der Map', () => {
    const d = mapLeadDetail(
      {
        id: 'l1', status: 'neu', einstufung: null, notiz: null,
        ansprechpartner_vorname: null, ansprechpartner_nachname: null, ansprechpartner_position: null,
        ansprechpartner_email: null, ansprechpartner_telefon: null,
      },
      [{ id: 'a1', typ: 'notiz', text: 'x', erstellt_von: 'unknown', erstellt_am: '2026-07-10' }],
      {},
    )
    expect(d.aktivitaeten[0].erstellt_von_name).toBeNull()
  })
})
