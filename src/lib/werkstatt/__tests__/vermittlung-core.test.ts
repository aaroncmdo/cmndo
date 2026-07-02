import { describe, it, expect } from 'vitest'
import { brauchtWerkstattVermittlung, buildZuweisungPatch } from '../vermittlung-core'

describe('brauchtWerkstattVermittlung', () => {
  const base = {
    reparaturwunsch: 'reparatur',
    reparatur_werkstatt_id: null,
    werkstatt_id: null,
    reparatur_vermittlung_status: 'offen',
  }
  it('true bei reparatur + keine Werkstatt + offen', () => {
    expect(brauchtWerkstattVermittlung(base)).toBe(true)
  })
  it('false bei fiktiv / unentschieden / null', () => {
    for (const w of ['fiktiv', 'unentschieden', null]) {
      expect(brauchtWerkstattVermittlung({ ...base, reparaturwunsch: w })).toBe(false)
    }
  })
  it('false wenn schon reparatur_werkstatt_id gesetzt', () => {
    expect(brauchtWerkstattVermittlung({ ...base, reparatur_werkstatt_id: 'w1' })).toBe(false)
  })
  it('false wenn Inbound-werkstatt_id gesetzt (kam ueber QR)', () => {
    expect(brauchtWerkstattVermittlung({ ...base, werkstatt_id: 'inbound1' })).toBe(false)
  })
  it('false bei status eigene/abgelehnt/vermittelt', () => {
    for (const s of ['eigene', 'abgelehnt', 'vermittelt']) {
      expect(brauchtWerkstattVermittlung({ ...base, reparatur_vermittlung_status: s })).toBe(false)
    }
  })
  it('default status offen wenn null', () => {
    expect(brauchtWerkstattVermittlung({ ...base, reparatur_vermittlung_status: null })).toBe(true)
  })
})

describe('buildZuweisungPatch', () => {
  it('setzt alle 5 Felder inkl. status=vermittelt + uebergebene quelle', () => {
    const p = buildZuweisungPatch('w1', 'u1', 'gutachter')
    expect(p.reparatur_werkstatt_id).toBe('w1')
    expect(p.reparatur_werkstatt_zugewiesen_von).toBe('u1')
    expect(p.reparatur_werkstatt_quelle).toBe('gutachter')
    expect(p.reparatur_vermittlung_status).toBe('vermittelt')
    expect(typeof p.reparatur_werkstatt_zugewiesen_am).toBe('string')
  })
})
