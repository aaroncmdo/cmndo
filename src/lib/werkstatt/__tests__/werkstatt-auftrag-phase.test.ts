import { describe, it, expect } from 'vitest'
import {
  werkstattAuftragPhase,
  reparaturwunschLabel,
  richtungLabel,
  operativeStatusLabel,
  type WerkstattAuftragPhaseInput,
} from '../werkstatt-auftrag-phase'

// Basis-Row: alles null -> 'neu'. Overrides pro Test.
function row(over: Partial<WerkstattAuftragPhaseInput> = {}): WerkstattAuftragPhaseInput {
  return {
    reparatur_termin_status: null,
    gutachten_fertiggestellt_am: null,
    gutachten_totalschaden: null,
    operative_status: null,
    besichtigung_start: null,
    ...over,
  }
}

const TS = '2026-07-01T10:00:00Z'

describe('werkstattAuftragPhase — Praezedenz-Leiter (kritischster/weitester Stand gewinnt)', () => {
  it('Reparaturtermin storniert -> abgelehnt/danger', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'storniert' }))).toMatchObject({ key: 'abgelehnt', ton: 'danger' })
  })
  it('Reparaturtermin abgelehnt -> abgelehnt/danger', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'abgelehnt' }))).toMatchObject({ key: 'abgelehnt', ton: 'danger' })
  })
  it('Reparaturtermin erledigt -> erledigt/success', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'erledigt' }))).toMatchObject({ key: 'erledigt', ton: 'success' })
  })
  it('Reparaturtermin bestaetigt -> termin_bestaetigt/success', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'bestaetigt' }))).toMatchObject({ key: 'termin_bestaetigt', ton: 'success' })
  })
  it('Reparaturtermin angefragt -> termin_offen/warning', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'angefragt' }))).toMatchObject({ key: 'termin_offen', ton: 'warning' })
  })
  it('Reparaturtermin anruf_erbeten -> termin_offen/warning', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'anruf_erbeten' }))).toMatchObject({ key: 'termin_offen', ton: 'warning' })
  })
  it('Gutachten fertig + Totalschaden -> totalschaden/danger', () => {
    expect(werkstattAuftragPhase(row({ gutachten_fertiggestellt_am: TS, gutachten_totalschaden: true }))).toMatchObject({ key: 'totalschaden', ton: 'danger' })
  })
  it('Gutachten fertig ohne Totalschaden -> gutachten_da/info', () => {
    expect(werkstattAuftragPhase(row({ gutachten_fertiggestellt_am: TS, gutachten_totalschaden: false }))).toMatchObject({ key: 'gutachten_da', ton: 'info' })
  })
  it('operative_status sv-termin -> besichtigung/info', () => {
    expect(werkstattAuftragPhase(row({ operative_status: 'sv-termin' }))).toMatchObject({ key: 'besichtigung', ton: 'info' })
  })
  it('besichtigung_start gesetzt -> besichtigung/info', () => {
    expect(werkstattAuftragPhase(row({ besichtigung_start: TS }))).toMatchObject({ key: 'besichtigung', ton: 'info' })
  })
  it('alles leer -> neu/neutral', () => {
    expect(werkstattAuftragPhase(row())).toMatchObject({ key: 'neu', ton: 'neutral' })
  })

  // Kollisionen — Praezedenz muss die Reihenfolge respektieren
  it('bestaetigter Termin schlaegt vorliegendes Gutachten (Termin gewinnt)', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'bestaetigt', gutachten_fertiggestellt_am: TS }))).toMatchObject({ key: 'termin_bestaetigt' })
  })
  it('Totalschaden schlaegt Besichtigung (Gutachten gewinnt ueber besichtigung)', () => {
    expect(
      werkstattAuftragPhase(row({ gutachten_fertiggestellt_am: TS, gutachten_totalschaden: true, operative_status: 'sv-termin', besichtigung_start: TS })),
    ).toMatchObject({ key: 'totalschaden' })
  })
  it('erledigter Termin schlaegt Totalschaden-Signal (Termin-Endzustand gewinnt)', () => {
    expect(
      werkstattAuftragPhase(row({ reparatur_termin_status: 'erledigt', gutachten_fertiggestellt_am: TS, gutachten_totalschaden: true })),
    ).toMatchObject({ key: 'erledigt' })
  })
  it('gutachten_totalschaden true ohne fertiggestellt_am -> NICHT totalschaden (nur besichtigung/neu)', () => {
    expect(werkstattAuftragPhase(row({ gutachten_totalschaden: true }))).toMatchObject({ key: 'neu' })
  })
  it('Label ist gesetzt (echte Umlaute)', () => {
    expect(werkstattAuftragPhase(row({ reparatur_termin_status: 'bestaetigt' })).label).toBe('Termin bestätigt')
  })
})

describe('Label-Normalisierung', () => {
  it('richtungLabel', () => {
    expect(richtungLabel('inbound')).toBe('Meine Vermittlung')
    expect(richtungLabel('vermittelt')).toBe('Auftrag')
    expect(richtungLabel(null)).toBe('–')
  })
  it('reparaturwunschLabel', () => {
    expect(reparaturwunschLabel('reparatur')).toBe('Reparatur')
    expect(reparaturwunschLabel('fiktiv')).toBe('Fiktiv')
    expect(reparaturwunschLabel(null)).toBeNull()
  })
  it('operativeStatusLabel — bekannt + Fallback', () => {
    expect(operativeStatusLabel('kanzlei-uebergeben')).toBe('An Kanzlei übergeben')
    expect(operativeStatusLabel(null)).toBeNull()
    expect(operativeStatusLabel('irgendwas-neues')).toBe('Irgendwas neues')
  })
})
