import { describe, it, expect } from 'vitest'
import { parseCsv, mapCsvZuLeads } from '../csv-import'

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

describe('mapCsvZuLeads', () => {
  it('mappt kanonische Header direkt', () => {
    const { header, rows } = parseCsv(
      'firma,vorname,nachname,email,telefon,plz,ort\nAcme,Max,Muster,a@acme.de,+49 221 1,50667,Köln',
    )
    const { valide, uebersprungen } = mapCsvZuLeads(header, rows, 'werkstatt')
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
    const { valide } = mapCsvZuLeads(header, rows, 'makler')
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
    const { valide } = mapCsvZuLeads(header, rows, 'werkstatt')
    expect(valide[0]).toEqual({ firma: 'Gamma', ort: 'Hamburg', telefon: '040123' })
  })

  it('legt dat/datNr und ihk in rollen_details ab', () => {
    const { header, rows } = parseCsv(
      'firma,datNr,ihk\nSV Nord,123456,D-1234-5678-90',
    )
    const { valide } = mapCsvZuLeads(header, rows, 'sachverstaendiger')
    expect(valide[0]).toEqual({
      firma: 'SV Nord',
      rollen_details: { datNr: '123456', ihk: 'D-1234-5678-90' },
    })
  })

  it('setzt rollen_details NICHT wenn keine Detail-Spalte befuellt ist', () => {
    const { header, rows } = parseCsv('firma\nAcme')
    const { valide } = mapCsvZuLeads(header, rows, 'werkstatt')
    expect(valide[0].rollen_details).toBeUndefined()
  })

  it('ueberspringt Zeilen ohne Firma und zaehlt sie', () => {
    const { header, rows } = parseCsv(
      'firma,email\nAcme,a@acme.de\n,orphan@x.de\n  ,b@b.de\nBeta,',
    )
    const { valide, uebersprungen } = mapCsvZuLeads(header, rows, 'werkstatt')
    expect(uebersprungen).toBe(2)
    expect(valide.map((l) => l.firma)).toEqual(['Acme', 'Beta'])
  })

  it('ignoriert unbekannte Spalten', () => {
    const { header, rows } = parseCsv('firma,umsatz,quelle\nAcme,1000,web')
    const { valide } = mapCsvZuLeads(header, rows, 'werkstatt')
    expect(valide[0]).toEqual({ firma: 'Acme' })
  })

  it('nimmt die erste befuellte Alias-Spalte je Ziel (firma vor company)', () => {
    const { header, rows } = parseCsv('firma,company\nEcht,Duplikat')
    const { valide } = mapCsvZuLeads(header, rows, 'werkstatt')
    expect(valide[0].firma).toBe('Echt')
  })

  it('gibt leeres Ergebnis bei nur Header ohne Datenzeilen', () => {
    const { header, rows } = parseCsv('firma,email')
    const { valide, uebersprungen } = mapCsvZuLeads(header, rows, 'werkstatt')
    expect(valide).toEqual([])
    expect(uebersprungen).toBe(0)
  })
})
