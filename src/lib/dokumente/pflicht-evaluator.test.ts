// AAR-542 (C5): Tests für den Pflicht-Doc-Evaluator-Wrapper.

import { describe, it, expect } from 'vitest'
import { evaluatePflichtdocs, gruppiereMatrix } from './pflicht-evaluator'
import type { DokumentKatalogRow } from './katalog'

function slot(partial: Partial<DokumentKatalogRow>): DokumentKatalogRow {
  return {
    slot_id: partial.slot_id ?? 'test_slot',
    label: partial.label ?? 'Test Slot',
    beschreibung: partial.beschreibung ?? null,
    kategorie: partial.kategorie ?? 'sonstiges',
    freigeschaltet_wenn: partial.freigeschaltet_wenn ?? null,
    pflicht_wenn: partial.pflicht_wenn ?? null,
    sichtbar_fuer: partial.sichtbar_fuer ?? ['admin'],
    anforderbar_von: partial.anforderbar_von ?? [],
    uploadbar_von: partial.uploadbar_von ?? ['kunde'],
    multi_file: partial.multi_file ?? false,
    akzeptierte_mime_types: partial.akzeptierte_mime_types ?? ['application/pdf'],
    max_mb: partial.max_mb ?? 10,
    sort_order: partial.sort_order ?? 0,
    aktiv: partial.aktiv ?? true,
    maps_to_qualifikation: partial.maps_to_qualifikation ?? null,
    steuert_kundensichtbarkeit: partial.steuert_kundensichtbarkeit ?? false,
  }
}

describe('evaluatePflichtdocs', () => {
  const katalog: DokumentKatalogRow[] = [
    slot({
      slot_id: 'fahrzeugschein',
      label: 'Fahrzeugschein',
      kategorie: 'stammdaten',
      pflicht_wenn: { op: 'eq', field: 'lead.zb1_status', value: 'offen' },
    }),
    slot({
      slot_id: 'polizeibericht',
      label: 'Polizeibericht',
      kategorie: 'unfall',
      pflicht_wenn: { op: 'eq', field: 'lead.polizei_vor_ort', value: true },
    }),
    slot({
      slot_id: 'aerztliches_attest',
      label: 'Ärztliches Attest',
      kategorie: 'personenschaden',
      freigeschaltet_wenn: { op: 'eq', field: 'lead.personenschaden_flag', value: true },
      pflicht_wenn: { op: 'eq', field: 'lead.personenschaden_flag', value: true },
    }),
    slot({
      slot_id: 'freigabe_bank',
      label: 'Freigabe Bank',
      kategorie: 'fahrzeug',
      pflicht_wenn: {
        op: 'in',
        field: 'lead.finanzierung_leasing',
        value: ['leasing', 'finanzierung'],
      },
    }),
    slot({ slot_id: 'kunde-nachreichung', label: 'Nachreichung', kategorie: 'sonstiges' }),
  ]

  it('Polizeibericht ist Pflicht bei polizei_vor_ort=true', () => {
    const entries = evaluatePflichtdocs({
      katalog,
      lead: { polizei_vor_ort: true, zb1_status: 'bestaetigt' },
      fall: null,
      pflichtdokumente: [],
    })
    const p = entries.find((e) => e.slot_id === 'polizeibericht')!
    expect(p.pflicht).toBe(true)
    expect(p.freigeschaltet).toBe(true)
    expect(p.regel_erklaerung).toContain('polizei_vor_ort')
  })

  it('Ärztliches Attest ist ⊘ bei personenschaden_flag=false', () => {
    const entries = evaluatePflichtdocs({
      katalog,
      lead: { personenschaden_flag: false },
      fall: null,
      pflichtdokumente: [],
    })
    const a = entries.find((e) => e.slot_id === 'aerztliches_attest')!
    expect(a.freigeschaltet).toBe(false)
    expect(a.pflicht).toBe(false)
    expect(a.status).toBe('not_applicable')
  })

  it('Freigabe Bank ist Pflicht bei finanzierung_leasing="leasing"', () => {
    const entries = evaluatePflichtdocs({
      katalog,
      lead: { finanzierung_leasing: 'leasing' },
      fall: null,
      pflichtdokumente: [],
    })
    const f = entries.find((e) => e.slot_id === 'freigabe_bank')!
    expect(f.pflicht).toBe(true)
  })

  it('Sammelslot kunde-nachreichung wird ausgeblendet', () => {
    const entries = evaluatePflichtdocs({
      katalog,
      lead: {},
      fall: null,
      pflichtdokumente: [],
    })
    expect(entries.find((e) => e.slot_id === 'kunde-nachreichung')).toBeUndefined()
  })

  it('Status aus pflichtdokumente-Row übernommen', () => {
    const entries = evaluatePflichtdocs({
      katalog,
      lead: { polizei_vor_ort: true },
      fall: null,
      pflichtdokumente: [
        { id: 'row-1', dokument_typ: 'polizeibericht', status: 'hochgeladen', pflicht: true },
      ],
    })
    const p = entries.find((e) => e.slot_id === 'polizeibericht')!
    expect(p.status).toBe('hochgeladen')
    expect(p.pflicht_row_id).toBe('row-1')
  })

  it('Inkonsistenz regel_pflicht_ohne_db wenn DB-Row fehlt', () => {
    const entries = evaluatePflichtdocs({
      katalog,
      lead: { polizei_vor_ort: true },
      fall: null,
      pflichtdokumente: [],
    })
    const p = entries.find((e) => e.slot_id === 'polizeibericht')!
    expect(p.inkonsistenz).toBe('regel_pflicht_ohne_db')
  })

  it('Inkonsistenz db_pflicht_ohne_regel bei manueller Pflicht', () => {
    const entries = evaluatePflichtdocs({
      katalog,
      lead: { polizei_vor_ort: false },
      fall: null,
      pflichtdokumente: [
        { id: 'row-2', dokument_typ: 'polizeibericht', status: 'ausstehend', pflicht: true },
      ],
    })
    const p = entries.find((e) => e.slot_id === 'polizeibericht')!
    expect(p.pflicht).toBe(false)
    expect(p.inkonsistenz).toBe('db_pflicht_ohne_regel')
  })
})

describe('gruppiereMatrix', () => {
  it('gruppiert nach Kategorie und sortiert Pflicht > Optional > Disabled', () => {
    const entries = evaluatePflichtdocs({
      katalog: [
        slot({ slot_id: 'a', label: 'A', kategorie: 'sonstiges' }),
        slot({
          slot_id: 'b',
          label: 'B',
          kategorie: 'sonstiges',
          pflicht_wenn: { op: 'eq', field: 'lead.flag', value: true },
        }),
        slot({
          slot_id: 'c',
          label: 'C',
          kategorie: 'sonstiges',
          freigeschaltet_wenn: { op: 'eq', field: 'lead.other', value: true },
        }),
      ],
      lead: { flag: true, other: false },
      fall: null,
      pflichtdokumente: [],
    })
    const groups = gruppiereMatrix(entries)
    expect(groups).toHaveLength(1)
    expect(groups[0].entries.map((e) => e.slot_id)).toEqual(['b', 'a', 'c'])
  })
})
