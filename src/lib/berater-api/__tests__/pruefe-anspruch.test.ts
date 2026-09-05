// src/lib/berater-api/__tests__/pruefe-anspruch.test.ts — Berater-API kennt die Werkstattbindung (Phase 2, Task 5)
import { describe, it, expect } from 'vitest'
import { parseWerkstattbindung, resolvePruefeAnspruch } from '../pruefe-anspruch'
import { zuBefund } from '../kasko-befund'
import type { LookupErgebnis, MarkeKurz, TarifKurz } from '@/lib/kasko-wb/lookup'

describe('resolvePruefeAnspruch — Werkstattbindung', () => {
  it('kasko + gebunden: keine Partnerwerkstatt, Versicherung benennt die Werkstatt', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'selbst', vollkasko: 'ja', werkstattbindung: 'ja' })
    expect(r.abrechnungsweg).toBe('kasko')
    expect(r.werkstattbindung).toBe('ja')
    expect(r.naechster_schritt).toContain('benennt die Werkstatt')
    expect(r.naechster_schritt).not.toContain('werkstatt-finden')
    expect(r.empfehlung).toContain('Werkstattbindung')
  })
  it('kasko + unbekannt: Rueckfrage nach dem Schein, Parameter-Hinweis', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'selbst', vollkasko: 'ja', werkstattbindung: 'unbekannt' })
    expect(r.werkstattbindung).toBe('unbekannt')
    expect(r.naechster_schritt).toContain('Versicherungsschein')
    expect(r.naechster_schritt).toContain('werkstattbindung=ja|nein')
  })
  it('kasko + frei: bisheriger Werkstatt-Weg mit Finder-Link', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'selbst', vollkasko: 'ja', werkstattbindung: 'nein' })
    expect(r.werkstattbindung).toBe('nein')
    expect(r.naechster_schritt).toContain('werkstatt-finden')
  })
  it('Tarifliste-Befund uebersteuert den Parameter und wird ausgegeben', () => {
    const r = resolvePruefeAnspruch({
      schuldfrage: 'selbst',
      vollkasko: 'ja',
      werkstattbindung: 'unbekannt',
      kaskoTarif: { versicherer: 'HUK-COBURG', tarif: 'Classic SELECT', werkstattbindung: 'ja', bindungsumfang: 'voll', verlaesslichkeit: 'belegt', kandidaten: [], stand: '2026-07-20' },
    })
    expect(r.werkstattbindung).toBe('ja')
    expect(r.kasko_tarif?.tarif).toBe('Classic SELECT')
    expect(r.naechster_schritt).toContain('HUK-COBURG')
    expect(r.naechster_schritt).toContain('Classic SELECT')
    expect(r.naechster_schritt).not.toContain('werkstatt-finden')
  })
  it('abgeleitete Verlaesslichkeit wird als Vorbehalt genannt, mehrdeutige Tarife als Kandidaten', () => {
    const r = resolvePruefeAnspruch({
      schuldfrage: 'selbst',
      vollkasko: 'ja',
      kaskoTarif: { versicherer: 'Allianz', tarif: null, werkstattbindung: 'unbekannt', bindungsumfang: null, verlaesslichkeit: null, kandidaten: ['Smart', 'Komfort', 'Premium'], stand: '2026-07-20' },
    })
    expect(r.naechster_schritt).toContain('Mögliche Tarife: Smart, Komfort, Premium')
    const r2 = resolvePruefeAnspruch({
      schuldfrage: 'selbst',
      vollkasko: 'ja',
      kaskoTarif: { versicherer: 'X', tarif: 'Y', werkstattbindung: 'nein', bindungsumfang: 'keine', verlaesslichkeit: 'abgeleitet', kandidaten: [], stand: null },
    })
    expect(r2.naechster_schritt).toContain('aus der Tarifbezeichnung abgeleitet')
  })
  it('haftpflicht: werkstattbindung ist null, Katalog und Texte wie bisher', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'unverschuldet', werkstattbindung: 'ja' })
    expect(r.abrechnungsweg).toBe('haftpflicht')
    expect(r.werkstattbindung).toBeNull()
    expect(r.kasko_tarif).toBeNull()
    expect(r.ansprueche.length).toBe(7)
    expect(r.eigenkosten).toMatch(/0 €/)
    expect(r.finanzierung).toContain('Sachverständigen')
  })
  it('selbstzahler und offene Vollkasko-Frage unveraendert', () => {
    expect(resolvePruefeAnspruch({ schuldfrage: 'selbst', vollkasko: 'nein' }).abrechnungsweg).toBe('selbstzahler')
    const offen = resolvePruefeAnspruch({ schuldfrage: 'selbst' })
    expect(offen.abrechnungsweg).toBeNull()
    expect(offen.werkstattbindung).toBeNull()
    expect(offen.naechster_schritt).toContain('vollkasko=ja|nein')
  })
  it('Parameter-Parsing wie bei vollkasko', () => {
    expect(parseWerkstattbindung('ja')).toBe('ja')
    expect(parseWerkstattbindung('true')).toBe('ja')
    expect(parseWerkstattbindung('nein')).toBe('nein')
    expect(parseWerkstattbindung(null)).toBe('unbekannt')
    expect(parseWerkstattbindung('vielleicht')).toBe('unbekannt')
  })
})

const marke = (over: Partial<MarkeKurz> = {}): MarkeKurz => ({ id: 'm1', slug: 'huk-coburg', marke: 'HUK-COBURG', wbStatus: 'optional', wbMarker: ['SELECT'], stand: '2026-07-20', ...over })
const tarif = (over: Partial<TarifKurz> = {}): TarifKurz => ({ id: 't1', anzeigename: 'Classic SELECT', hatWerkstattbindung: true, bindungsumfang: 'voll', verlaesslichkeit: 'belegt', ...over })

describe('zuBefund — Lookup -> Berater-Befund', () => {
  it('gefundener gebundener Tarif -> ja, keine Kandidaten', () => {
    const e: LookupErgebnis = { status: 'gefunden', marke: marke(), tarif: tarif(), tarifStatus: 'gefunden', tarifKandidaten: [] }
    expect(zuBefund(e, 'huk', 'classic select')).toMatchObject({ versicherer: 'HUK-COBURG', tarif: 'Classic SELECT', werkstattbindung: 'ja', bindungsumfang: 'voll', kandidaten: [], stand: '2026-07-20' })
  })
  it('Marke optional ohne Tarif -> unbekannt + alle Tarife als Kandidaten', () => {
    const e: LookupErgebnis = { status: 'gefunden', marke: marke(), tarif: null, tarifStatus: 'nicht_angegeben', tarifKandidaten: [tarif({ anzeigename: 'Classic', hatWerkstattbindung: false, bindungsumfang: 'keine' }), tarif()] }
    const b = zuBefund(e, 'HUK-COBURG', null)
    expect(b.werkstattbindung).toBe('unbekannt')
    expect(b.kandidaten).toEqual(['Classic', 'Classic SELECT'])
  })
  it('Marke standard ohne Tarif -> ja (Bindung haengt nicht am Tarif), keine Kandidaten', () => {
    const e: LookupErgebnis = { status: 'gefunden', marke: marke({ marke: 'Verti', wbStatus: 'standard' }), tarif: null, tarifStatus: 'nicht_angegeben', tarifKandidaten: [tarif()] }
    expect(zuBefund(e, 'verti', null)).toMatchObject({ werkstattbindung: 'ja', kandidaten: [] })
  })
  it('Marke keine -> nein', () => {
    const e: LookupErgebnis = { status: 'gefunden', marke: marke({ marke: 'LVM', wbStatus: 'keine' }), tarif: null, tarifStatus: 'nicht_angegeben', tarifKandidaten: [] }
    expect(zuBefund(e, 'lvm', null).werkstattbindung).toBe('nein')
  })
  it('mehrdeutige Marke -> unbekannt + Marken-Kandidaten; nicht gefunden -> unbekannt ohne Kandidaten', () => {
    const e: LookupErgebnis = { status: 'mehrdeutig', kandidaten: [marke(), marke({ id: 'm2', slug: 'huk24', marke: 'HUK24' })] }
    expect(zuBefund(e, 'huk', null)).toMatchObject({ versicherer: 'huk', werkstattbindung: 'unbekannt', kandidaten: ['HUK-COBURG', 'HUK24'] })
    expect(zuBefund({ status: 'nicht_gefunden' }, 'Gothaer', null)).toMatchObject({ werkstattbindung: 'unbekannt', kandidaten: [], stand: null })
  })
})
