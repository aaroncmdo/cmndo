import { describe, it, expect } from 'vitest'
import { brauchtWerkstattVermittlung, buildZuweisungPatch, pruefeWerkstattAuswahl } from '../vermittlung-core'

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
  it('true bei fiktiv (SP4d: Werkstatt-Suche auch bei fiktiver Abrechnung — Aaron-Direktive)', () => {
    expect(brauchtWerkstattVermittlung({ ...base, reparaturwunsch: 'fiktiv' })).toBe(true)
  })
  it('false bei unentschieden / null', () => {
    for (const w of ['unentschieden', null]) {
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

  it('accountloser Kunde (userId=null) -> zugewiesen_von=null, NICHT "" (uuid-Cast-Fehler)', () => {
    const p = buildZuweisungPatch('w1', null, 'kunde')
    expect(p.reparatur_werkstatt_zugewiesen_von).toBeNull()
    expect(p.reparatur_werkstatt_quelle).toBe('kunde')
    expect(p.reparatur_vermittlung_status).toBe('vermittelt')
  })

  it('leerer String als userId -> ebenfalls null (defensiv)', () => {
    const p = buildZuweisungPatch('w1', '', 'kunde')
    expect(p.reparatur_werkstatt_zugewiesen_von).toBeNull()
  })
})

describe('pruefeWerkstattAuswahl — der Step wird bedienbar statt versteckt (28.08.2026)', () => {
  // Der Werkstatt-Step laesst sich nicht wegkonfigurieren: FlowWizardKfz friert die
  // Step-Sequenz beim Mount ein, `reparaturwunsch` wird aber erst mitten im Flow erhoben.
  // Wer die Frage ueberspringt, bekommt den Step also trotzdem — und muss ihn bedienen koennen.
  const frei = { reparatur_werkstatt_id: null, werkstatt_id: null, reparatur_vermittlung_status: null }

  it('mit echtem Wunsch: erlaubt, nichts nachzutragen', () => {
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: 'reparatur' }))
      .toEqual({ erlaubt: true, wunschNachtragen: false })
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: 'fiktiv' }))
      .toEqual({ erlaubt: true, wunschNachtragen: false })
  })

  it('Frage uebersprungen (null) -> erlaubt, Wunsch wird nachgetragen', () => {
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: null }))
      .toEqual({ erlaubt: true, wunschNachtragen: true })
  })

  it("'unentschieden' zaehlt als nicht festgelegt -> ebenfalls nachtragen", () => {
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: 'unentschieden' }))
      .toEqual({ erlaubt: true, wunschNachtragen: true })
  })

  it("'keine' ist eine ABSAGE und wird nie ueberschrieben", () => {
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: 'keine' }))
      .toEqual({ erlaubt: false, wunschNachtragen: false })
  })

  it('alle uebrigen Sperren bleiben in Kraft — auch ohne Wunsch', () => {
    // bereits vermittelt
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: null, reparatur_werkstatt_id: 'w1' }).erlaubt).toBe(false)
    // Inbound-QR-Werkstatt
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: null, werkstatt_id: 'i1' }).erlaubt).toBe(false)
    // Status nicht mehr offen
    expect(pruefeWerkstattAuswahl({ ...frei, reparaturwunsch: null, reparatur_vermittlung_status: 'vermittelt' }).erlaubt).toBe(false)
  })
})
