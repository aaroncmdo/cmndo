// Smoke: Pflichtdokument-Anzeige leitet aus dokument_katalog (SSoT) ab.
// Nach der Kanonisierung gibt es nur EINE Quelle -> kein Drift-Vergleich mehr,
// sondern ein Verhaltens-Regressionstest der Katalog-Ableitung pro Szenario.
import { describe, it, expect } from 'vitest'
import { buildDokumentKontext } from './build-kontext'
import { getOffeneDokumentAnforderungen } from '../claims/data-requirements'
import type { DokumentKatalogRow } from './katalog'

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
function ctxFrom(s: Szenario) {
  return buildDokumentKontext({
    claim: { hat_personenschaden: s.personenschaden ?? false, hat_sachschaden: s.sachschaden ?? false, polizei_vor_ort: s.polizeiVorOrt ?? false, fahrerflucht: s.fahrerflucht ?? false, finanzierung_leasing: s.leasing ? 'leasing' : 'keine', zeugen_vorhanden: s.zeugen ?? false },
    lead: { id: 'smoke-lead', zb1_status: s.zb1Status ?? 'offen' },
  })
}
function pflicht(s: Szenario): Set<string> {
  return new Set(getOffeneDokumentAnforderungen(KATALOG, ctxFrom(s), []).filter((x) => x.pflicht).map((x) => x.slot_id))
}

describe('Pflichtdokumente: Katalog-abgeleitete Pflicht-Anzeige', () => {
  it('Standard: fahrzeugschein Pflicht', () => expect(pflicht({}).has('fahrzeugschein')).toBe(true))
  it('Standard: unfallfotos Pflicht', () => expect(pflicht({}).has('unfallfotos')).toBe(true))
  it('ZB1 bestaetigt: fahrzeugschein NICHT Pflicht', () => expect(pflicht({ zb1Status: 'bestaetigt' }).has('fahrzeugschein')).toBe(false))
  it('Personenschaden: aerztliches_attest Pflicht', () => expect(pflicht({ personenschaden: true }).has('aerztliches_attest')).toBe(true))
  it('Personenschaden: diagnosebericht Pflicht (Aaron-Entscheid)', () => expect(pflicht({ personenschaden: true }).has('diagnosebericht')).toBe(true))
  it('Sachschaden: sachschaden_foto Pflicht', () => expect(pflicht({ sachschaden: true }).has('sachschaden_foto')).toBe(true))
  it('Polizei vor Ort: polizeibericht Pflicht', () => expect(pflicht({ polizeiVorOrt: true }).has('polizeibericht')).toBe(true))
  it('Fahrerflucht ohne Polizei: polizeibericht Pflicht', () => expect(pflicht({ fahrerflucht: true, polizeiVorOrt: false }).has('polizeibericht')).toBe(true))
  it('Leasing: freigabe_bank Pflicht', () => expect(pflicht({ leasing: true }).has('freigabe_bank')).toBe(true))
  it('Zeugen: zeugenbericht Pflicht (Katalog-slot-id, nicht zeugenaussage)', () => expect(pflicht({ zeugen: true }).has('zeugenbericht')).toBe(true))
})
