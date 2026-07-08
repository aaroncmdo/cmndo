import { describe, it, expect } from 'vitest'
import { buildSchadenLeadInput, normalizeSchadensart, type SchadenMeldenForm, type KundeKontext } from '../schaden-melden'

const kunde: KundeKontext = {
  userId: 'user-1',
  vorname: 'Lisa',
  nachname: 'Mueller',
  telefon: '+491701234567',
  email: 'lisa@example.de',
  sprache: 'de',
}

const validForm: SchadenMeldenForm = {
  kennzeichen: 'K-AB 123',
  unfalldatum: '2026-07-01',
  unfallhergang: 'Auffahrunfall an der Ampel.',
  unfallort: 'Aachener Straße 12',
  schadenPlz: '50667',
  schadensart: 'haftpflicht',
  gegnerBekannt: true,
  istFahrzeughalter: true,
}

describe('normalizeSchadensart', () => {
  it('behält gültige Schadensart', () => {
    expect(normalizeSchadensart('vollkasko')).toBe('vollkasko')
  })
  it('mappt ungültige/leere auf unbekannt', () => {
    expect(normalizeSchadensart('quatsch')).toBe('unbekannt')
    expect(normalizeSchadensart(null)).toBe('unbekannt')
    expect(normalizeSchadensart(undefined)).toBe('unbekannt')
  })
})

describe('buildSchadenLeadInput', () => {
  it('baut base + extra bei gültiger Eingabe', () => {
    const r = buildSchadenLeadInput(validForm, kunde)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.base.source_channel).toBe('kunde_portal')
    expect(r.base.status).toBe('neu')
    expect(r.base.vorname).toBe('Lisa')
    expect(r.base.email).toBe('lisa@example.de')
    expect(r.extra.kunde_id).toBe('user-1') // Kunde = geschaedigter
    expect(r.extra.schadens_art).toBe('haftpflicht')
    expect(r.extra.fahrzeug_standort_plz).toBe('50667')
    expect(r.extra.fahrzeug_standort_adresse).toBe('Aachener Straße 12')
    expect(r.extra.gegner_bekannt).toBe(true)
    expect(r.extra.ist_fahrzeughalter).toBe(true)
    expect(r.extra.qualifizierungs_phase).toBe('konvertiert')
  })

  it('lehnt fehlende/ungültige PLZ ab', () => {
    expect(buildSchadenLeadInput({ ...validForm, schadenPlz: '' }, kunde).ok).toBe(false)
    expect(buildSchadenLeadInput({ ...validForm, schadenPlz: '123' }, kunde).ok).toBe(false)
    expect(buildSchadenLeadInput({ ...validForm, schadenPlz: 'abcde' }, kunde).ok).toBe(false)
  })

  it('lehnt fehlenden Kunden ab', () => {
    const r = buildSchadenLeadInput(validForm, { ...kunde, userId: '' })
    expect(r.ok).toBe(false)
  })

  it('normalisiert unbekannte Schadensart auf unbekannt', () => {
    const r = buildSchadenLeadInput({ ...validForm, schadensart: 'blah' }, kunde)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.extra.schadens_art).toBe('unbekannt')
  })

  it('setzt sichere Defaults (gegner_bekannt=false, ist_fahrzeughalter=true)', () => {
    const r = buildSchadenLeadInput({ schadenPlz: '50667' }, kunde)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.extra.gegner_bekannt).toBe(false)
    expect(r.extra.ist_fahrzeughalter).toBe(true)
    expect(r.extra.schadens_art).toBe('unbekannt')
  })

  it('trimmt Freitext + leere Strings werden null', () => {
    const r = buildSchadenLeadInput({ schadenPlz: '50667', kennzeichen: '   ', unfallhergang: '  Hallo  ' }, kunde)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.extra.kennzeichen).toBeNull()
    expect(r.extra.unfallhergang).toBe('Hallo')
  })
})
