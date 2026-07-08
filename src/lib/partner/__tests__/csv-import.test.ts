import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  heuristischesMapping,
  mapCsvMitMapping,
  parseLlmMapping,
  CSV_ZIEL_FELDER,
  type CsvZielFeld,
} from '../csv-import'

describe('parseCsv', () => {
  it('parst Header + Datenzeilen (simpel)', () => {
    const { header, rows } = parseCsv('firma,email\nAcme,a@acme.de\nBeta,b@beta.de')
    expect(header).toEqual(['firma', 'email'])
    expect(rows).toEqual([
      ['Acme', 'a@acme.de'],
      ['Beta', 'b@beta.de'],
    ])
  })

  it('behandelt \\r\\n (Windows) wie \\n', () => {
    const { header, rows } = parseCsv('firma,ort\r\nAcme,Köln\r\nBeta,Bonn\r\n')
    expect(header).toEqual(['firma', 'ort'])
    expect(rows).toEqual([
      ['Acme', 'Köln'],
      ['Beta', 'Bonn'],
    ])
  })

  it('respektiert Kommas innerhalb gequoteter Felder', () => {
    const { rows } = parseCsv('firma,ort\n"Acme, Inc.",Köln')
    expect(rows).toEqual([['Acme, Inc.', 'Köln']])
  })

  it('entquotet escapte Anfuehrungszeichen ("")', () => {
    const { rows } = parseCsv('firma\n"Die ""Beste"" GmbH"')
    expect(rows).toEqual([['Die "Beste" GmbH']])
  })

  it('erlaubt Zeilenumbrueche innerhalb gequoteter Felder', () => {
    const { rows } = parseCsv('firma,notiz\nAcme,"Zeile1\nZeile2"')
    expect(rows).toEqual([['Acme', 'Zeile1\nZeile2']])
  })

  it('verwirft leere Zeilen und Trailing-Newline', () => {
    const { rows } = parseCsv('firma\nAcme\n\nBeta\n')
    expect(rows).toEqual([['Acme'], ['Beta']])
  })

  it('entfernt ein fuehrendes BOM aus der Header-Zelle', () => {
    const { header } = parseCsv('﻿firma,email\nAcme,a@acme.de')
    expect(header).toEqual(['firma', 'email'])
  })

  it('gibt leere Struktur bei leerem Text zurueck', () => {
    expect(parseCsv('')).toEqual({ header: [], rows: [] })
  })
})

// mapCsvZuLeads wurde entfernt (Finding 2 — toter Code nach datNr/ihk-Migration).
// Die Tests laufen aequivalent ueber mapCsvMitMapping(rows, heuristischesMapping(header)).
describe('mapCsvMitMapping via heuristischesMapping (ehemals mapCsvZuLeads)', () => {
  it('mappt kanonische Header direkt', () => {
    const { header, rows } = parseCsv(
      'firma,vorname,nachname,email,telefon,plz,ort\nAcme,Max,Muster,a@acme.de,+49 221 1,50667,Köln',
    )
    const { valide, uebersprungen } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(uebersprungen).toBe(0)
    expect(valide).toEqual([
      {
        firma: 'Acme',
        ansprechpartner_vorname: 'Max',
        ansprechpartner_nachname: 'Muster',
        email: 'a@acme.de',
        telefon: '+49 221 1',
        plz: '50667',
        ort: 'Köln',
      },
    ])
  })

  it('erkennt englische/alternative Header-Aliase (case-insensitiv)', () => {
    const { header, rows } = parseCsv(
      'Company,First Name,Last Name,E-Mail,Phone,ZIP,City\nBeta Ltd,Jane,Doe,j@beta.io,00441,10115,Berlin',
    )
    const { valide } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide[0]).toEqual({
      firma: 'Beta Ltd',
      ansprechpartner_vorname: 'Jane',
      ansprechpartner_nachname: 'Doe',
      email: 'j@beta.io',
      telefon: '00441',
      plz: '10115',
      ort: 'Berlin',
    })
  })

  it('mappt name/stadt/tel als weitere Aliase', () => {
    const { header, rows } = parseCsv('name,stadt,tel\nGamma,Hamburg,040123')
    const { valide } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide[0]).toEqual({ firma: 'Gamma', ort: 'Hamburg', telefon: '040123' })
  })

  it('legt dat/datNr und ihk in rollen_details ab', () => {
    const { header, rows } = parseCsv(
      'firma,datNr,ihk\nSV Nord,123456,D-1234-5678-90',
    )
    const { valide } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide[0]).toEqual({
      firma: 'SV Nord',
      rollen_details: { datNr: '123456', ihk: 'D-1234-5678-90' },
    })
  })

  it('legt "DAT-Nr"-Header in rollen_details.datNr ab (Alias dat-nr)', () => {
    const { header, rows } = parseCsv('firma,DAT-Nr\nSV Sued,999888')
    const { valide } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide[0]).toEqual({
      firma: 'SV Sued',
      rollen_details: { datNr: '999888' },
    })
  })

  it('setzt rollen_details NICHT wenn keine Detail-Spalte befuellt ist', () => {
    const { header, rows } = parseCsv('firma\nAcme')
    const { valide } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide[0].rollen_details).toBeUndefined()
  })

  it('ueberspringt Zeilen ohne Firma und zaehlt sie', () => {
    const { header, rows } = parseCsv(
      'firma,email\nAcme,a@acme.de\n,orphan@x.de\n  ,b@b.de\nBeta,',
    )
    const { valide, uebersprungen } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(uebersprungen).toBe(2)
    expect(valide.map((l) => l.firma)).toEqual(['Acme', 'Beta'])
  })

  it('ignoriert unbekannte Spalten', () => {
    const { header, rows } = parseCsv('firma,umsatz,quelle\nAcme,1000,web')
    const { valide } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide[0]).toEqual({ firma: 'Acme' })
  })

  it('nimmt die erste befuellte Alias-Spalte je Ziel (firma vor company)', () => {
    const { header, rows } = parseCsv('firma,company\nEcht,Duplikat')
    const { valide } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide[0].firma).toBe('Echt')
  })

  it('gibt leeres Ergebnis bei nur Header ohne Datenzeilen', () => {
    const { header, rows } = parseCsv('firma,email')
    const { valide, uebersprungen } = mapCsvMitMapping(rows, heuristischesMapping(header))
    expect(valide).toEqual([])
    expect(uebersprungen).toBe(0)
  })
})

describe('CSV_ZIEL_FELDER', () => {
  it('enthält genau die 10 definierten Zielfelder (inkl. datNr und ihk)', () => {
    const expected: CsvZielFeld[] = [
      'firma',
      'email',
      'telefon',
      'ansprechpartner_vorname',
      'ansprechpartner_nachname',
      'plz',
      'ort',
      'datNr',
      'ihk',
      'ignorieren',
    ]
    expect([...CSV_ZIEL_FELDER].sort()).toEqual([...expected].sort())
    expect(CSV_ZIEL_FELDER.length).toBe(10)
  })
})

describe('heuristischesMapping', () => {
  it('mappt "Firma" → firma', () => {
    const mapping = heuristischesMapping(['Firma'])
    expect(mapping[0]).toBe('firma')
  })

  it('mappt "E-Mail" → email (case-insensitiv)', () => {
    const mapping = heuristischesMapping(['E-Mail'])
    expect(mapping[0]).toBe('email')
  })

  it('mappt bekannte Aliase korrekt', () => {
    const mapping = heuristischesMapping(['Company', 'First Name', 'Last Name', 'Phone', 'ZIP', 'City'])
    expect(mapping[0]).toBe('firma')
    expect(mapping[1]).toBe('ansprechpartner_vorname')
    expect(mapping[2]).toBe('ansprechpartner_nachname')
    expect(mapping[3]).toBe('telefon')
    expect(mapping[4]).toBe('plz')
    expect(mapping[5]).toBe('ort')
  })

  it('mappt unbekannte Header auf "ignorieren"', () => {
    const mapping = heuristischesMapping(['xyz', 'umsatz', 'quelle'])
    expect(mapping).toEqual(['ignorieren', 'ignorieren', 'ignorieren'])
  })

  it('mappt rollen_details-Aliase (dat, datNr, ihk) auf first-class Targets', () => {
    const mapping = heuristischesMapping(['dat', 'datNr', 'ihk'])
    expect(mapping).toEqual(['datNr', 'datNr', 'ihk'])
  })

  it('gibt leeres Array fuer leeren Header zurueck', () => {
    expect(heuristischesMapping([])).toEqual([])
  })
})

describe('mapCsvMitMapping', () => {
  it('wendet explizites Mapping an und erzeugt korrekte PartnerCsvLead', () => {
    const rows = [['Acme GmbH', 'max@acme.de', '+49 221 1', 'Max', 'Muster', '50667', 'Köln']]
    const mapping: CsvZielFeld[] = [
      'firma', 'email', 'telefon', 'ansprechpartner_vorname', 'ansprechpartner_nachname', 'plz', 'ort',
    ]
    const { valide, uebersprungen } = mapCsvMitMapping(rows, mapping)
    expect(uebersprungen).toBe(0)
    expect(valide).toEqual([
      {
        firma: 'Acme GmbH',
        email: 'max@acme.de',
        telefon: '+49 221 1',
        ansprechpartner_vorname: 'Max',
        ansprechpartner_nachname: 'Muster',
        plz: '50667',
        ort: 'Köln',
      },
    ])
  })

  it('überspringt Zeilen ohne firma-Zielfeld befüllt und zaehlt sie', () => {
    const rows = [
      ['', 'mail@x.de'],   // kein Firmenwert → übersprungen
      ['Beta', 'b@b.de'],  // valide
    ]
    const mapping: CsvZielFeld[] = ['firma', 'email']
    const { valide, uebersprungen } = mapCsvMitMapping(rows, mapping)
    expect(uebersprungen).toBe(1)
    expect(valide).toHaveLength(1)
    expect(valide[0].firma).toBe('Beta')
  })

  it('ignoriert Spalten die als "ignorieren" gemappt sind', () => {
    const rows = [['Acme', 'ignorierterWert', 'a@acme.de']]
    const mapping: CsvZielFeld[] = ['firma', 'ignorieren', 'email']
    const { valide } = mapCsvMitMapping(rows, mapping)
    expect(valide[0]).toEqual({ firma: 'Acme', email: 'a@acme.de' })
  })

  it('nimmt das erste befuellte firma-Feld wenn mehrere firma-Spalten gemappt sind', () => {
    const rows = [['ErsteFirma', 'ZweiteFirma']]
    const mapping: CsvZielFeld[] = ['firma', 'firma']
    const { valide } = mapCsvMitMapping(rows, mapping)
    expect(valide[0].firma).toBe('ErsteFirma')
  })

  it('gibt leeres Ergebnis bei leeren rows', () => {
    const { valide, uebersprungen } = mapCsvMitMapping([], ['firma'])
    expect(valide).toEqual([])
    expect(uebersprungen).toBe(0)
  })

  it('schreibt datNr-Target in rollen_details (explizites Mapping)', () => {
    const rows = [['SV Ost', '654321']]
    const mapping: CsvZielFeld[] = ['firma', 'datNr']
    const { valide } = mapCsvMitMapping(rows, mapping)
    expect(valide[0]).toEqual({ firma: 'SV Ost', rollen_details: { datNr: '654321' } })
  })

  it('schreibt ihk-Target in rollen_details (explizites Mapping)', () => {
    const rows = [['Makler West', 'D-9999-1111-22']]
    const mapping: CsvZielFeld[] = ['firma', 'ihk']
    const { valide } = mapCsvMitMapping(rows, mapping)
    expect(valide[0]).toEqual({ firma: 'Makler West', rollen_details: { ihk: 'D-9999-1111-22' } })
  })

  it('setzt rollen_details NICHT wenn datNr/ihk-Spalten leer sind', () => {
    const rows = [['Acme', '']]
    const mapping: CsvZielFeld[] = ['firma', 'datNr']
    const { valide } = mapCsvMitMapping(rows, mapping)
    expect(valide[0].rollen_details).toBeUndefined()
  })
})

describe('parseLlmMapping', () => {
  it('parst valides JSON und gibt ein korrektes CsvZielFeld-Array in Header-Reihenfolge zurueck', () => {
    const header = ['Firma', 'E-Mail', 'Telefon']
    const json = JSON.stringify({ 'Firma': 'firma', 'E-Mail': 'email', 'Telefon': 'telefon' })
    const result = parseLlmMapping(json, header)
    expect(result).toEqual(['firma', 'email', 'telefon'])
  })

  it('liefert null bei kaputtem (nicht-parsebarem) JSON', () => {
    const header = ['Firma', 'Email']
    const result = parseLlmMapping('{ ungueltig json }}}', header)
    expect(result).toBeNull()
  })

  it('liefert null bei JSON das kein Objekt ist (z.B. Array)', () => {
    const header = ['Firma']
    const result = parseLlmMapping('["firma"]', header)
    expect(result).toBeNull()
  })

  it('setzt unbekanntes Zielfeld auf "ignorieren"', () => {
    const header = ['Firma', 'KomischeSpalte']
    const json = JSON.stringify({ 'Firma': 'firma', 'KomischeSpalte': 'unbekannt_ziel' })
    const result = parseLlmMapping(json, header)
    expect(result).toEqual(['firma', 'ignorieren'])
  })

  it('setzt fehlende Header-Eintraege (im JSON nicht vorhanden) auf "ignorieren"', () => {
    const header = ['Firma', 'Ort', 'PLZ']
    const json = JSON.stringify({ 'Firma': 'firma' }) // Ort und PLZ fehlen im JSON
    const result = parseLlmMapping(json, header)
    expect(result).toEqual(['firma', 'ignorieren', 'ignorieren'])
  })

  it('respektiert die Header-Reihenfolge (Ausgabe hat selbe Laenge wie header)', () => {
    const header = ['Ort', 'Firma', 'Email']
    const json = JSON.stringify({ 'Firma': 'firma', 'Email': 'email', 'Ort': 'ort' })
    const result = parseLlmMapping(json, header)
    expect(result).toHaveLength(header.length)
    expect(result).toEqual(['ort', 'firma', 'email'])
  })

  it('gibt ein leeres Array bei leerem Header zurueck (valides JSON, kein Fehler)', () => {
    const result = parseLlmMapping('{}', [])
    expect(result).toEqual([])
  })

  it('liefert null bei leerem String', () => {
    const result = parseLlmMapping('', ['Firma'])
    expect(result).toBeNull()
  })
})
