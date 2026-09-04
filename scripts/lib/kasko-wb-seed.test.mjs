import { describe, it, expect } from 'vitest'
import { expandTarife, validateSeed, buildSeedSql, sqlLit, sqlTextArray } from './kasko-wb-seed.mjs'

const huk = {
  slug: 'huk-coburg', marke: 'HUK-COBURG', versicherung_name: 'HUK-COBURG-Allgemeine Versicherung AG',
  wb_status: 'optional', wb_zusaetze: [{ zusatz: 'SELECT' }], wb_marker: ['SELECT', 'Kasko SELECT'],
  nicht_wb_marker: ['Kasko PLUS'], linien: ['Basis', 'Classic', 'Classic Kasko PLUS'],
  linien_ohne_wb: [], linien_nur_wb: [], hinweis: null, varianten_hinweis: null, check24_vertrieb: 'L', konditionen: null,
}
const lvm = {
  slug: 'lvm', marke: 'LVM', versicherung_name: 'LVM Landwirtschaftlicher Versicherungsverein Münster a.G.',
  wb_status: 'keine', wb_zusaetze: [], wb_marker: [], nicht_wb_marker: ['mit LVM-SchadenService'],
  linien: [], linien_ohne_wb: ['AutoPlus', 'AutoPlus mit LVM-SchadenService'], linien_nur_wb: [],
  hinweis: 'Steuerungsangebot, keine Bindung', varianten_hinweis: null, check24_vertrieb: 'L', konditionen: null,
}
const vw = {
  slug: 'volkswagen-autoversicherung', marke: 'Volkswagen Autoversicherung', versicherung_name: null,
  wb_status: 'standard', wb_zusaetze: [{ zusatz: 'mit Werkstattbindung' }], wb_marker: ['mit Werkstattbindung'],
  nicht_wb_marker: [], linien: [], linien_ohne_wb: [], linien_nur_wb: ['Basis', 'Optimal', 'Premium'],
  hinweis: null, varianten_hinweis: null, check24_vertrieb: 'L', konditionen: null,
}
const signal = {
  ...huk, slug: 'signal-iduna', marke: 'Signal Iduna', linien: ['Basis', 'Premium'], nicht_wb_marker: [],
  wb_marker: ['Sorglos Kasko', 'Sorglos Kasko Glas'],
  wb_zusaetze: [{ zusatz: 'Sorglos Kasko', umfang: 'voll' }, { zusatz: 'Sorglos Kasko Glas', umfang: 'nur_glas' }],
}
const defaults = {
  nachlass_text: 'marktüblich 10–20 %', sanktion_modell: 'kuerzung_80', sanktion_text: 'GDV 80 %', gilt_fuer: 'VK+TK',
  ausnahmen_text: 'Haftpflicht', partnernetz: null, akb_fundstelle: 'A.2.5.2.5.2', quelle: 'GDV',
}
const data = { quelle: 'CHECK24 20.07.2026', stand: '2026-07-20', default_konditionen: defaults, marken: [huk, lvm, vw, signal] }

describe('expandTarife', () => {
  it('optional: je Linie eine freie Zeile und eine je WB-Zusatz', () => {
    const rows = expandTarife(huk)
    expect(rows.map((r) => r.anzeigename)).toEqual([
      'Basis', 'Basis SELECT', 'Classic', 'Classic SELECT', 'Classic Kasko PLUS', 'Classic Kasko PLUS SELECT',
    ])
    expect(rows.find((r) => r.anzeigename === 'Classic SELECT')).toMatchObject({
      linie: 'Classic', wb_zusatz: 'SELECT', hat_werkstattbindung: true, bindungsumfang: 'voll', verlaesslichkeit: 'belegt',
    })
    expect(rows.find((r) => r.anzeigename === 'Classic')).toMatchObject({ hat_werkstattbindung: false, bindungsumfang: 'keine' })
  })
  it('zwei Stufen (Signal Iduna): voll und nur_glas', () => {
    const rows = expandTarife(signal)
    expect(rows.map((r) => r.anzeigename)).toEqual([
      'Basis', 'Basis Sorglos Kasko', 'Basis Sorglos Kasko Glas', 'Premium', 'Premium Sorglos Kasko', 'Premium Sorglos Kasko Glas',
    ])
    expect(rows[2]).toMatchObject({ hat_werkstattbindung: true, bindungsumfang: 'nur_glas' })
  })
  it('keine: nur freie Zeilen · standard: nur gebundene Zeilen', () => {
    expect(expandTarife(lvm).every((r) => r.hat_werkstattbindung === false)).toBe(true)
    expect(expandTarife(lvm)).toHaveLength(2)
    const v = expandTarife(vw)
    expect(v.every((r) => r.hat_werkstattbindung === true)).toBe(true)
    expect(v.map((r) => r.anzeigename)).toEqual(['Basis mit Werkstattbindung', 'Optimal mit Werkstattbindung', 'Premium mit Werkstattbindung'])
  })
  it('tarife_explizit gewinnt (VRK-Schreibweise)', () => {
    const vrk = { ...huk, slug: 'vrk', tarife_explizit: [
      { anzeigename: 'Classic Kasko Plus', linie: 'Classic Kasko Plus', wb_zusatz: null, wb: false },
      { anzeigename: 'Classic Select Kasko Plus', linie: 'Classic Kasko Plus', wb_zusatz: 'Select', wb: true },
    ] }
    expect(expandTarife(vrk).map((r) => r.anzeigename)).toEqual(['Classic Kasko Plus', 'Classic Select Kasko Plus'])
  })
  it('verlaesslichkeit_default wird uebernommen', () => {
    const bgv = { ...huk, slug: 'bgv', verlaesslichkeit_default: 'abgeleitet' }
    expect(expandTarife(bgv).every((r) => r.verlaesslichkeit === 'abgeleitet')).toBe(true)
  })
  it('reihenfolge ist fortlaufend ab 10', () => {
    expect(expandTarife(huk).map((r) => r.reihenfolge)).toEqual([10, 20, 30, 40, 50, 60])
  })
})

describe('validateSeed', () => {
  it('gueltige Daten -> keine Fehler', () => {
    expect(validateSeed(data)).toEqual([])
  })
  it('doppelter Slug, optional ohne Marker, keine mit WB-Zeile -> Fehler', () => {
    const bad = { ...data, marken: [
      huk, { ...huk },
      { ...huk, slug: 'x', wb_marker: [], wb_zusaetze: [] },
      { ...lvm, slug: 'y', linien: ['A'], wb_zusaetze: [{ zusatz: 'Z' }] },
    ] }
    const errs = validateSeed(bad)
    expect(errs.some((e) => e.includes('doppelter slug'))).toBe(true)
    expect(errs.some((e) => e.includes('optional ohne wb_marker'))).toBe(true)
    expect(errs.some((e) => e.includes('keine mit WB-Zeile'))).toBe(true)
  })
  it('ungueltige Enum-Werte werden gemeldet', () => {
    const errs = validateSeed({ ...data, marken: [{ ...huk, wb_status: 'egal', check24_vertrieb: 'X' }] })
    expect(errs.some((e) => e.includes('wb_status'))).toBe(true)
    expect(errs.some((e) => e.includes('check24_vertrieb'))).toBe(true)
  })
})

describe('sql', () => {
  it('sqlLit escaped Hochkommata, null -> NULL', () => {
    expect(sqlLit("Brandgilde von 1691 VVaG 'a.G.'")).toBe("'Brandgilde von 1691 VVaG ''a.G.'''")
    expect(sqlLit(null)).toBe('NULL')
  })
  it('sqlTextArray', () => {
    expect(sqlTextArray([])).toBe("'{}'::text[]")
    expect(sqlTextArray(['SELECT', "O'Brien"])).toBe("ARRAY['SELECT','O''Brien']::text[]")
  })
  it('buildSeedSql ist idempotent (ON CONFLICT), koppelt per slug und backfillt den Rechtstraeger per Name', () => {
    const sql = buildSeedSql(data)
    expect(sql).toContain("INSERT INTO public.kasko_versicherer_marken")
    expect(sql).toContain("ON CONFLICT (slug) DO UPDATE")
    expect(sql).toContain("ON CONFLICT (marke_id, anzeigename) DO UPDATE")
    expect(sql).toContain("FROM public.kasko_versicherer_marken m WHERE m.slug = 'huk-coburg'")
    expect(sql).toContain("v.name = 'HUK-COBURG-Allgemeine Versicherung AG'")
    expect(sql).toContain("'__default__'")
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  })
})
