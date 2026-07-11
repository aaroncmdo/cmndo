import { describe, it, expect } from 'vitest'
import {
  istErledigtNichtGeschlossen,
  istKeineWerkstattZugewiesen,
  istTerminUeberfaelligNichtErledigt,
  type ReparaturTerminRow,
  type ClaimReparaturRow,
} from '../repair-workstate-checks'

// Fabriken fuer Test-Rows (minimale Felder, sinnvolle Defaults)
const termin = (o: Partial<ReparaturTerminRow> & Pick<ReparaturTerminRow, 'claim_id'>): ReparaturTerminRow => ({
  id: 'termin-1',
  werkstatt_id: 'ws-1',
  status: 'bestaetigt',
  bestaetigter_termin: null,
  erledigt_am: null,
  ...o,
})

const claim = (o: Partial<ClaimReparaturRow> & Pick<ClaimReparaturRow, 'id'>): ClaimReparaturRow => ({
  operative_status: 'in_bearbeitung',
  abrechnungsweg: 'selbstzahler',
  reparatur_werkstatt_id: 'ws-1',
  konvertiert_am: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3d ago
  ...o,
})

// ── istErledigtNichtGeschlossen ──────────────────────────────────────────────

describe('istErledigtNichtGeschlossen', () => {
  it('true wenn Termin erledigt und Claim nicht abgeschlossen', () => {
    expect(
      istErledigtNichtGeschlossen(
        termin({ claim_id: 'c1', status: 'erledigt' }),
        claim({ id: 'c1', operative_status: 'in_bearbeitung' }),
      ),
    ).toBe(true)
  })

  it('false wenn Termin erledigt und Claim abgeschlossen (happy path)', () => {
    expect(
      istErledigtNichtGeschlossen(
        termin({ claim_id: 'c1', status: 'erledigt' }),
        claim({ id: 'c1', operative_status: 'abgeschlossen' }),
      ),
    ).toBe(false)
  })

  it('false wenn Termin nicht erledigt', () => {
    expect(
      istErledigtNichtGeschlossen(
        termin({ claim_id: 'c1', status: 'bestaetigt' }),
        claim({ id: 'c1', operative_status: 'in_bearbeitung' }),
      ),
    ).toBe(false)
  })

  it('false wenn Claim storniert (auch ohne Abschluss kein Finding)', () => {
    expect(
      istErledigtNichtGeschlossen(
        termin({ claim_id: 'c1', status: 'erledigt' }),
        claim({ id: 'c1', operative_status: 'storniert' }),
      ),
    ).toBe(false)
  })

  it('true wenn operative_status null (null ist kein Terminal-Zustand)', () => {
    expect(
      istErledigtNichtGeschlossen(
        termin({ claim_id: 'c1', status: 'erledigt' }),
        claim({ id: 'c1', operative_status: null }),
      ),
    ).toBe(true)
  })
})

// ── istKeineWerkstattZugewiesen ──────────────────────────────────────────────

describe('istKeineWerkstattZugewiesen', () => {
  const now = new Date('2026-07-11T12:00:00Z')

  it('true fuer selbstzahler-Claim ohne Werkstatt, aelter als 48h', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'selbstzahler',
          reparatur_werkstatt_id: null,
          konvertiert_am: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          operative_status: 'in_bearbeitung',
        }),
        now,
      ),
    ).toBe(true)
  })

  it('true fuer kasko-Claim ohne Werkstatt, aelter als 48h', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'kasko',
          reparatur_werkstatt_id: null,
          konvertiert_am: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          operative_status: 'in_bearbeitung',
        }),
        now,
      ),
    ).toBe(true)
  })

  it('false fuer haftpflicht-Claim (kein Reparatur-Claim)', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'haftpflicht',
          reparatur_werkstatt_id: null,
          konvertiert_am: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          operative_status: 'in_bearbeitung',
        }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn Werkstatt zugewiesen', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'selbstzahler',
          reparatur_werkstatt_id: 'ws-1',
          konvertiert_am: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          operative_status: 'in_bearbeitung',
        }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn Claim juenger als 48h', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'selbstzahler',
          reparatur_werkstatt_id: null,
          konvertiert_am: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // 24h ago
          operative_status: 'in_bearbeitung',
        }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn Claim abgeschlossen (terminal)', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'selbstzahler',
          reparatur_werkstatt_id: null,
          konvertiert_am: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          operative_status: 'abgeschlossen',
        }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn Claim storniert (terminal)', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'selbstzahler',
          reparatur_werkstatt_id: null,
          konvertiert_am: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          operative_status: 'storniert',
        }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn konvertiert_am null (kein Timestamp-Anker)', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'selbstzahler',
          reparatur_werkstatt_id: null,
          konvertiert_am: null,
          operative_status: 'in_bearbeitung',
        }),
        now,
      ),
    ).toBe(false)
  })

  it('false bei exakt 48h (Grenze: >48h noetig, exakt 48h ist noch nicht alt genug)', () => {
    expect(
      istKeineWerkstattZugewiesen(
        claim({
          id: 'c1',
          abrechnungsweg: 'selbstzahler',
          reparatur_werkstatt_id: null,
          konvertiert_am: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(), // exactly 48h
          operative_status: 'in_bearbeitung',
        }),
        now,
      ),
    ).toBe(false)
  })
})

// ── istTerminUeberfaelligNichtErledigt ───────────────────────────────────────

describe('istTerminUeberfaelligNichtErledigt', () => {
  const now = new Date('2026-07-11T12:00:00Z')
  const vor4Tagen = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString()
  const vor2Tagen = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()

  it('true fuer bestaetigt + bestaetigter_termin mehr als 3d in der Vergangenheit', () => {
    expect(
      istTerminUeberfaelligNichtErledigt(
        termin({ claim_id: 'c1', status: 'bestaetigt', bestaetigter_termin: vor4Tagen }),
        now,
      ),
    ).toBe(true)
  })

  it('false wenn Termin erledigt (trotz ueberfaelligem Datum)', () => {
    expect(
      istTerminUeberfaelligNichtErledigt(
        termin({ claim_id: 'c1', status: 'erledigt', bestaetigter_termin: vor4Tagen }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn Termin bestaetigt aber innerhalb von 3d', () => {
    expect(
      istTerminUeberfaelligNichtErledigt(
        termin({ claim_id: 'c1', status: 'bestaetigt', bestaetigter_termin: vor2Tagen }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn Termin storniert', () => {
    expect(
      istTerminUeberfaelligNichtErledigt(
        termin({ claim_id: 'c1', status: 'storniert', bestaetigter_termin: vor4Tagen }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn bestaetigter_termin null', () => {
    expect(
      istTerminUeberfaelligNichtErledigt(
        termin({ claim_id: 'c1', status: 'bestaetigt', bestaetigter_termin: null }),
        now,
      ),
    ).toBe(false)
  })

  it('false wenn bestaetigter_termin ungueltig', () => {
    expect(
      istTerminUeberfaelligNichtErledigt(
        termin({ claim_id: 'c1', status: 'bestaetigt', bestaetigter_termin: 'kaputt' }),
        now,
      ),
    ).toBe(false)
  })
})
