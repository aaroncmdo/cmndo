// Smoke / Konsistenz-Test: "Werden die richtigen Pflichtdokumente abgefragt,
// je nachdem was der Kunde angegeben hat?"
//
// Nach der Kanonisierung (dokument_katalog = SSoT) leitet die operative Anzeige
// (getOffeneDokumentAnforderungen) aus dem Katalog ab. Dieser Test vergleicht
// sie gegen den (noch nicht migrierten) berechneErwartung-Pfad ueber eine
// Szenario-Matrix.
//
// GRUEN = Quellen stimmen ueberein. it.fails = bekannte Rest-Drifts, die erst
// mit Task 7 (berechneErwartung -> Katalog-Wrapper) verschwinden; sie schlagen
// dann automatisch in "unerwartet gruen" um -> Signal, it.fails zu entfernen.

import { describe, it, expect } from 'vitest'
import { berechneErwartung } from './erwartung'
import { buildDokumentKontext } from './build-kontext'
import { getOffeneDokumentAnforderungen } from '../claims/data-requirements'
import type { DokumentKatalogRow } from './katalog'

// Katalog-Fixtures: kunde-relevante Slots mit ihren kanonischen Live-Regeln
// (Stand nach P1-DDL 20260626140204 + 20260626141125).
function fix(slot_id: string, frei: unknown, pflicht: unknown): DokumentKatalogRow {
  return {
    slot_id, label: slot_id, beschreibung: null, kategorie: 'unfall',
    freigeschaltet_wenn: frei as DokumentKatalogRow['freigeschaltet_wenn'],
    pflicht_wenn: pflicht as DokumentKatalogRow['pflicht_wenn'],
    sichtbar_fuer: ['kunde'], anforderbar_von: ['kundenbetreuer'], uploadbar_von: ['kunde'],
    multi_file: false, akzeptierte_mime_types: ['application/pdf'], max_mb: 10,
    sort_order: 1, aktiv: true, maps_to_qualifikation: null, steuert_kundensichtbarkeit: false,
  }
}
const EQ = (field: string, value: unknown) => ({ op: 'eq', field, value })
const OR = (...c: unknown[]) => ({ op: 'or', conditions: c })
const NEQ = (field: string, value: unknown) => ({ op: 'neq', field, value })
const IN = (field: string, value: unknown[]) => ({ op: 'in', field, value })
const NOTNULL = (field: string) => ({ op: 'is_not_null', field })

const KATALOG: DokumentKatalogRow[] = [
  fix('fahrzeugschein', NEQ('lead.zb1_status', 'bestaetigt'), NEQ('lead.zb1_status', 'bestaetigt')),
  fix('unfallfotos', null, NOTNULL('lead.id')),
  fix('schadensfotos', null, NOTNULL('lead.id')),
  fix('polizeibericht', OR(EQ('lead.polizei_vor_ort', true), EQ('lead.fahrerflucht', true)), OR(EQ('lead.polizei_vor_ort', true), EQ('lead.fahrerflucht', true))),
  fix('aerztliches_attest', EQ('lead.personenschaden_flag', true), EQ('lead.personenschaden_flag', true)),
  fix('diagnosebericht', EQ('lead.personenschaden_flag', true), EQ('lead.personenschaden_flag', true)),
  fix('sachschaden_foto', EQ('lead.sachschaden_flag', true), EQ('lead.sachschaden_flag', true)),
  fix('freigabe_bank', IN('lead.finanzierung_leasing', ['leasing', 'finanzierung']), IN('lead.finanzierung_leasing', ['leasing', 'finanzierung'])),
  fix('zeugenbericht', OR(EQ('lead.zeugen_vorhanden', true), EQ('fall.zeugen_vorhanden', true)), OR(EQ('lead.zeugen_vorhanden', true), EQ('fall.zeugen_vorhanden', true))),
]

type Szenario = { personenschaden?: boolean; sachschaden?: boolean; polizeiVorOrt?: boolean; fahrerflucht?: boolean; leasing?: boolean; zeugen?: boolean; zb1Status?: string }

function leadFrom(s: Szenario): Parameters<typeof berechneErwartung>[0] {
  return {
    zb1_status: s.zb1Status ?? 'offen', polizei_vor_ort: s.polizeiVorOrt ?? false,
    polizeibericht_pflicht: s.polizeiVorOrt ?? false, fahrerflucht: s.fahrerflucht ?? false,
    personenschaden_flag: s.personenschaden ?? false, sachschaden_flag: s.sachschaden ?? false,
    zeugen_vorhanden: s.zeugen ?? false, finanzierung_leasing: s.leasing ? 'leasing' : 'keine',
  }
}
function ctxFrom(s: Szenario) {
  return buildDokumentKontext({
    claim: {
      hat_personenschaden: s.personenschaden ?? false, hat_sachschaden: s.sachschaden ?? false,
      polizei_vor_ort: s.polizeiVorOrt ?? false, fahrerflucht: s.fahrerflucht ?? false,
      finanzierung_leasing: s.leasing ? 'leasing' : 'keine', zeugen_vorhanden: s.zeugen ?? false,
    },
    lead: { id: 'smoke-lead', zb1_status: s.zb1Status ?? 'offen' },
  })
}
function erwartungPflicht(s: Szenario): Set<string> {
  return new Set(berechneErwartung(leadFrom(s)).filter((x) => x.pflicht).map((x) => x.slot_id))
}
function dataReqPflicht(s: Szenario): Set<string> {
  return new Set(getOffeneDokumentAnforderungen(KATALOG, ctxFrom(s), []).filter((x) => x.pflicht).map((x) => x.slot_id))
}

describe('Pflichtdokumente-Konsistenz: Katalog-Ableitung vs. erwartung', () => {
  // ─── GRUEN: konsistente Faelle ───────────────────────────────────────────
  it('Standard: fahrzeugschein in BEIDEN Pflicht', () => {
    expect(erwartungPflicht({}).has('fahrzeugschein')).toBe(true)
    expect(dataReqPflicht({}).has('fahrzeugschein')).toBe(true)
  })
  it('Standard: Unfallfotos in BEIDEN Pflicht', () => {
    expect(erwartungPflicht({}).has('unfallfotos')).toBe(true)
    expect(dataReqPflicht({}).has('unfallfotos')).toBe(true)
  })
  it('Personenschaden: aerztliches_attest in BEIDEN Pflicht', () => {
    expect(erwartungPflicht({ personenschaden: true }).has('aerztliches_attest')).toBe(true)
    expect(dataReqPflicht({ personenschaden: true }).has('aerztliches_attest')).toBe(true)
  })
  it('Sachschaden: sachschaden_foto in BEIDEN Pflicht', () => {
    expect(erwartungPflicht({ sachschaden: true }).has('sachschaden_foto')).toBe(true)
    expect(dataReqPflicht({ sachschaden: true }).has('sachschaden_foto')).toBe(true)
  })
  it('ZB1 bestaetigt: fahrzeugschein in BEIDEN NICHT Pflicht', () => {
    expect(erwartungPflicht({ zb1Status: 'bestaetigt' }).has('fahrzeugschein')).toBe(false)
    expect(dataReqPflicht({ zb1Status: 'bestaetigt' }).has('fahrzeugschein')).toBe(false)
  })
  it('Polizei vor Ort: polizeibericht in BEIDEN Pflicht', () => {
    expect(erwartungPflicht({ polizeiVorOrt: true }).has('polizeibericht')).toBe(true)
    expect(dataReqPflicht({ polizeiVorOrt: true }).has('polizeibericht')).toBe(true)
  })

  // ─── FIXED durch Kanonisierung (waren Drifts, jetzt gruen) ────────────────
  it('Leasing -> freigabe_bank jetzt in operativer Anzeige Pflicht', () => {
    expect(erwartungPflicht({ leasing: true }).has('freigabe_bank')).toBe(true)
    expect(dataReqPflicht({ leasing: true }).has('freigabe_bank')).toBe(true)
  })
  it('Fahrerflucht ohne Polizei -> polizeibericht jetzt in operativer Anzeige Pflicht', () => {
    expect(erwartungPflicht({ fahrerflucht: true, polizeiVorOrt: false }).has('polizeibericht')).toBe(true)
    expect(dataReqPflicht({ fahrerflucht: true, polizeiVorOrt: false }).has('polizeibericht')).toBe(true)
  })

  // ─── REST-DRIFT (erst Task 7: berechneErwartung -> Katalog-Wrapper) ───────
  it.fails('DRIFT(bis Task 7): diagnosebericht-Pflicht widerspricht (erwartung optional)', () => {
    const pers: Szenario = { personenschaden: true }
    expect(erwartungPflicht(pers).has('diagnosebericht')).toBe(dataReqPflicht(pers).has('diagnosebericht'))
  })
  it.fails('DRIFT(bis Task 7): erwartung nutzt zeugenaussage statt Katalog-zeugenbericht', () => {
    const ids = berechneErwartung(leadFrom({ zeugen: true })).map((x) => x.slot_id)
    expect(ids).toContain('zeugenbericht')
  })
})
