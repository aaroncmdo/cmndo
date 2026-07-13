// PROD-VERIFIKATION (execute_sql, READ-only) — vor Merge einmal laufen:
//  (a) Werkstatt sieht Fremdes?
//      SELECT c.id, c.werkstatt_id, c.reparatur_werkstatt_id FROM claims c
//      WHERE c.werkstatt_id IS NOT NULL AND c.reparatur_werkstatt_id IS NOT NULL
//        AND c.werkstatt_id <> c.reparatur_werkstatt_id;   -- erwartet: bewusste Vermittler/Reparateur-Splits
//  (b) reparatur_werkstatt_id gesetzt, aber vermittlung_status != 'vermittelt'?  (Inkonsistenz-Leak)
//      SELECT id FROM claims WHERE reparatur_werkstatt_id IS NOT NULL AND reparatur_vermittlung_status IS DISTINCT FROM 'vermittelt';
//  Finding != leer/plausibel -> im Marker melden.
//
// NOTE: Supabase MCP was DOWN at test-write time (2026-07-10) — SQL above is documentation only.

import { describe, it, expect } from 'vitest'
import { buildZuweisungPatch, brauchtWerkstattVermittlung } from '../vermittlung-core'

describe('buildZuweisungPatch — Bug-A-Regression: setzt IMMER alle 5 Felder', () => {
  it('setzt id + audit + quelle + status atomar', () => {
    const patch = buildZuweisungPatch('ws-1', 'user-1', 'dispatcher')
    expect(patch.reparatur_werkstatt_id).toBe('ws-1')
    expect(patch.reparatur_werkstatt_zugewiesen_von).toBe('user-1')
    expect(patch.reparatur_werkstatt_quelle).toBe('dispatcher')
    expect(patch.reparatur_vermittlung_status).toBe('vermittelt')
    expect(typeof patch.reparatur_werkstatt_zugewiesen_am).toBe('string')
    expect(Object.keys(patch).sort()).toEqual([
      'reparatur_vermittlung_status',
      'reparatur_werkstatt_id',
      'reparatur_werkstatt_quelle',
      'reparatur_werkstatt_zugewiesen_am',
      'reparatur_werkstatt_zugewiesen_von',
    ])
  })

  it('accountloser Kunde (userId null) → zugewiesen_von = null, NIE leerer String', () => {
    const patch = buildZuweisungPatch('ws-1', null, 'kunde')
    expect(patch.reparatur_werkstatt_zugewiesen_von).toBeNull()
  })
})

describe('brauchtWerkstattVermittlung — Gate-Invarianten', () => {
  it('true nur wenn Reparatur/fiktiv gewünscht, keine Werkstatt, status offen', () => {
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur' })).toBe(true)
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'fiktiv' })).toBe(true)
  })
  it('false sobald eine Werkstatt gesetzt ist (reparatur ODER vermittler)', () => {
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur', reparatur_werkstatt_id: 'x' })).toBe(false)
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur', werkstatt_id: 'x' })).toBe(false)
  })
  it('false wenn bereits vermittelt', () => {
    expect(brauchtWerkstattVermittlung({ reparaturwunsch: 'reparatur', reparatur_vermittlung_status: 'vermittelt' })).toBe(false)
  })
})
