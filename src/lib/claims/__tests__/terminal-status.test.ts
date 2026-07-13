// FG5 Cluster 1, Task 1a: Unit-Tests fuer istClaimGeschlossen + die beiden Sets.
import { describe, expect, it } from 'vitest'
import {
  istClaimGeschlossen,
  TERMINAL_CLAIM_STATUS,
  CLOSED_OPERATIVE_STATUS,
} from '../terminal-status'

describe('TERMINAL_CLAIM_STATUS', () => {
  it('enthaelt reguliert_vollstaendig', () => {
    expect(TERMINAL_CLAIM_STATUS.has('reguliert_vollstaendig')).toBe(true)
  })
  it('enthaelt storniert', () => {
    expect(TERMINAL_CLAIM_STATUS.has('storniert')).toBe(true)
  })
  it('enthaelt alle 7 ABSCHLUSS_SUBSTATE-Keys', () => {
    const expected = [
      'reguliert_vollstaendig',
      'storniert',
      'klage_rechtsstreit',
      'verjaehrt',
      'abgelehnt_final',
      'an_externe_kanzlei_uebergeben',
      'termin_durchgefuehrt',
    ]
    for (const k of expected) {
      expect(TERMINAL_CLAIM_STATUS.has(k)).toBe(true)
    }
  })
})

describe('CLOSED_OPERATIVE_STATUS', () => {
  it('enthaelt abgeschlossen', () => {
    expect(CLOSED_OPERATIVE_STATUS.has('abgeschlossen')).toBe(true)
  })
  it('enthaelt storniert', () => {
    expect(CLOSED_OPERATIVE_STATUS.has('storniert')).toBe(true)
  })
  it('enthaelt nur 2 Werte', () => {
    expect(CLOSED_OPERATIVE_STATUS.size).toBe(2)
  })
})

describe('istClaimGeschlossen', () => {
  // --- Bug-Repro: storniert claim mit abgeschlossen_am=null ---
  it('storniert (terminal status) ohne abgeschlossen_am → true (bug-repro)', () => {
    expect(istClaimGeschlossen({ status: 'storniert' })).toBe(true)
  })

  it('operative status abgeschlossen → true', () => {
    expect(istClaimGeschlossen({ operativeStatus: 'abgeschlossen' })).toBe(true)
  })

  it('operative status storniert → true', () => {
    expect(istClaimGeschlossen({ operativeStatus: 'storniert' })).toBe(true)
  })

  it('abgeschlossen_am gesetzt (Timestamp) → true', () => {
    expect(istClaimGeschlossen({ abgeschlossenAm: '2026-01-01T00:00:00Z' })).toBe(true)
  })

  it('status in_bearbeitung → false', () => {
    expect(istClaimGeschlossen({ status: 'in_bearbeitung' })).toBe(false)
  })

  it('leere Args → false', () => {
    expect(istClaimGeschlossen({})).toBe(false)
  })

  it('null-Werte ueberall → false', () => {
    expect(istClaimGeschlossen({ status: null, operativeStatus: null, abgeschlossenAm: null })).toBe(false)
  })

  it('reguliert_vollstaendig (terminaler claims.status) → true', () => {
    expect(istClaimGeschlossen({ status: 'reguliert_vollstaendig' })).toBe(true)
  })

  it('verjaehrt → true', () => {
    expect(istClaimGeschlossen({ status: 'verjaehrt' })).toBe(true)
  })

  it('sv-zugewiesen → false', () => {
    expect(istClaimGeschlossen({ status: 'sv-zugewiesen' })).toBe(false)
  })
})
