import { describe, it, expect } from 'vitest'
import {
  sucheBegriffFuerRolle,
  normalisiereTelefon,
  normalisiereFirma,
  parseDeutscheAdresse,
  mapPlaceZuKandidat,
  istDublette,
  dedupeInBatch,
  filterGegenBestand,
  type ScrapeKandidat,
  type BestandsLead,
} from '../scraping'

describe('sucheBegriffFuerRolle', () => {
  it('liefert rollen-spezifische Branchenbegriffe', () => {
    expect(sucheBegriffFuerRolle('sachverstaendiger')).toContain('Gutachter')
    expect(sucheBegriffFuerRolle('werkstatt')).toContain('Werkstatt')
    expect(sucheBegriffFuerRolle('makler')).toContain('Versicherungsmakler')
  })
})

describe('normalisiereTelefon', () => {
  it('reduziert auf Vergleichsziffern und normalisiert +49/0049 auf 0', () => {
    expect(normalisiereTelefon('+49 40 123456')).toBe('040123456')
    expect(normalisiereTelefon('0049 40 123456')).toBe('040123456')
    expect(normalisiereTelefon('040 / 12 34 56')).toBe('040123456')
  })
  it('leere/null Eingaben → leerer String', () => {
    expect(normalisiereTelefon(null)).toBe('')
    expect(normalisiereTelefon('')).toBe('')
  })
})

describe('normalisiereFirma', () => {
  it('ignoriert Case und Satzzeichen', () => {
    expect(normalisiereFirma('KFZ-Gutachter Müller GmbH')).toBe(normalisiereFirma('kfz gutachter müller gmbh'))
  })
})

describe('parseDeutscheAdresse', () => {
  it('parst Strasse, PLZ und Ort aus vollstaendiger Adresse', () => {
    expect(parseDeutscheAdresse('Mönckebergstraße 7, 20095 Hamburg, Deutschland')).toEqual({
      strasse: 'Mönckebergstraße 7',
      plz: '20095',
      ort: 'Hamburg',
    })
  })
  it('kommt ohne Strasse klar', () => {
    expect(parseDeutscheAdresse('80331 München, Deutschland')).toEqual({
      strasse: null,
      plz: '80331',
      ort: 'München',
    })
  })
  it('ignoriert Germany/Deutschland als Land', () => {
    expect(parseDeutscheAdresse('Hauptstr. 1, 10827 Berlin, Germany').plz).toBe('10827')
  })
  it('leere Eingabe → alles null', () => {
    expect(parseDeutscheAdresse('')).toEqual({ strasse: null, plz: null, ort: null })
  })
})

describe('mapPlaceZuKandidat', () => {
  it('kombiniert Text-Result + Details zu einem Kandidaten', () => {
    const k = mapPlaceZuKandidat(
      { place_id: 'p1', name: 'Gutachter Meier', formatted_address: 'Weg 3, 50667 Köln, Deutschland' },
      { formatted_phone_number: '0221 123', website: 'https://meier.de' },
    )
    expect(k).toMatchObject({
      google_place_id: 'p1',
      firma: 'Gutachter Meier',
      telefon: '0221 123',
      website: 'https://meier.de',
      plz: '50667',
      ort: 'Köln',
    })
  })
  it('Details null → telefon/website null', () => {
    const k = mapPlaceZuKandidat({ place_id: 'p2', name: 'X', formatted_address: '10115 Berlin' }, null)
    expect(k.telefon).toBeNull()
    expect(k.website).toBeNull()
  })
})

const kandidat = (over: Partial<ScrapeKandidat> = {}): ScrapeKandidat => ({
  google_place_id: 'g1',
  firma: 'Firma A',
  telefon: '040 111',
  website: null,
  strasse: null,
  plz: '20095',
  ort: 'Hamburg',
  formatted_address: 'x',
  ...over,
})

describe('istDublette', () => {
  it('matcht auf gleiche google_place_id', () => {
    const best: BestandsLead[] = [{ google_place_id: 'g1', firma: 'Ganz anders', telefon: null, plz: null }]
    expect(istDublette(kandidat(), best)).toBe(true)
  })
  it('matcht auf gleiche (normalisierte) Telefonnummer', () => {
    const best: BestandsLead[] = [{ google_place_id: null, firma: 'Ganz anders', telefon: '+4940111', plz: '99999' }]
    expect(istDublette(kandidat(), best)).toBe(true)
  })
  it('matcht auf gleiche Firma + gleiche PLZ', () => {
    const best: BestandsLead[] = [{ google_place_id: null, firma: 'firma a', telefon: null, plz: '20095' }]
    expect(istDublette(kandidat({ telefon: null }), best)).toBe(true)
  })
  it('gleiche Firma aber andere PLZ = keine Dublette', () => {
    const best: BestandsLead[] = [{ google_place_id: null, firma: 'Firma A', telefon: null, plz: '80331' }]
    expect(istDublette(kandidat({ telefon: null }), best)).toBe(false)
  })
  it('nichts gemeinsam = keine Dublette', () => {
    const best: BestandsLead[] = [{ google_place_id: 'other', firma: 'Other', telefon: '030 999', plz: '10115' }]
    expect(istDublette(kandidat(), best)).toBe(false)
  })
})

describe('dedupeInBatch', () => {
  it('entfernt Dubletten innerhalb der Trefferliste (gleiche place_id)', () => {
    const out = dedupeInBatch([kandidat({ google_place_id: 'g1' }), kandidat({ google_place_id: 'g1', firma: 'Firma A (Filiale)' })])
    expect(out).toHaveLength(1)
  })
  it('behaelt verschiedene Treffer', () => {
    const out = dedupeInBatch([kandidat({ google_place_id: 'g1' }), kandidat({ google_place_id: 'g2', telefon: '030 222' })])
    expect(out).toHaveLength(2)
  })
})

describe('filterGegenBestand', () => {
  it('teilt in neu vs dubletten', () => {
    const kandidaten = [kandidat({ google_place_id: 'neu1', telefon: '040 555', plz: '20144' }), kandidat({ google_place_id: 'dup1' })]
    const best: BestandsLead[] = [{ google_place_id: 'dup1', firma: 'x', telefon: null, plz: null }]
    const { neu, dubletten } = filterGegenBestand(kandidaten, best)
    expect(neu.map((k) => k.google_place_id)).toEqual(['neu1'])
    expect(dubletten.map((k) => k.google_place_id)).toEqual(['dup1'])
  })
})
