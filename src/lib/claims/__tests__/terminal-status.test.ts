// FG5 Cluster 1, Task 1a: Unit-Tests fuer istClaimGeschlossen + die Sets.
// T3-S5: TERMINAL_CLAIM_STATUS + der status-Arm sind entfernt (claims.status gedroppt) —
// die feinen Terminals leben vollstaendig in CLOSED_OPERATIVE_STATUS.
import { describe, expect, it } from 'vitest'
import {
  istClaimGeschlossen,
  CLOSED_OPERATIVE_STATUS,
  NONTERMINAL_OPERATIVE_OUTCOME,
} from '../terminal-status'

describe('CLOSED_OPERATIVE_STATUS', () => {
  it('enthaelt abgeschlossen', () => {
    expect(CLOSED_OPERATIVE_STATUS.has('abgeschlossen')).toBe(true)
  })
  it('enthaelt storniert', () => {
    expect(CLOSED_OPERATIVE_STATUS.has('storniert')).toBe(true)
  })
  // Vorher: `size === 2`. Die Status-Achsen-Konsolidierung B2 (#4285) hat die Menge auf 7
  // erweitert — operative_status traegt die FEINEN Terminal-Outcomes jetzt direkt (statt sie
  // auf coarse 'abgeschlossen' zu kollabieren) — der FG5-Test wurde dabei nicht nachgezogen und
  // war seither rot (CI faehrt nur `build`, kein vitest). Statt einer nackten Zahl jetzt die
  // Menge selbst pruefen: das faengt sowohl ein fehlendes als auch ein zuviel-eingetragenes Element.
  it('enthaelt die 8 operative_status-Terminals (B2 feine Outcomes + B4-slice-2a-i-b termin_durchgefuehrt)', () => {
    const expected = [
      'abgeschlossen',
      'storniert',
      'reguliert_vollstaendig',
      'klage_rechtsstreit',
      'verjaehrt',
      'abgelehnt_final',
      'an_externe_kanzlei_uebergeben',
      // B4-slice-2a-i-b: nur_gutachter-Terminal traegt jetzt operative_status direkt.
      'termin_durchgefuehrt',
    ]
    for (const k of expected) {
      expect(CLOSED_OPERATIVE_STATUS.has(k), `CLOSED_OPERATIVE_STATUS fehlt ${k}`).toBe(true)
    }
    expect(CLOSED_OPERATIVE_STATUS.size).toBe(expected.length)
  })
})

// B4-slice-1b: die zwei NICHT-terminalen Outcomes tragen jetzt ebenfalls operative_status.
// Der entscheidende Invariant: sie duerfen NIEMALS in CLOSED_OPERATIVE_STATUS landen — sonst
// verschwindet jeder Claim in VS-Verhandlung / Nachforderung schlagartig aus ALLEN "aktive
// Faelle"-Filtern (die alle ueber CLOSED_OPERATIVE_STATUS_PG negativ-filtern) und gilt als billable.
describe('NONTERMINAL_OPERATIVE_OUTCOME', () => {
  it('enthaelt in_kommunikation_vs + abgelehnt', () => {
    expect(NONTERMINAL_OPERATIVE_OUTCOME.has('in_kommunikation_vs')).toBe(true)
    expect(NONTERMINAL_OPERATIVE_OUTCOME.has('abgelehnt')).toBe(true)
    expect(NONTERMINAL_OPERATIVE_OUTCOME.size).toBe(2)
  })

  it('ist disjunkt zu CLOSED_OPERATIVE_STATUS (bleibt aktiv, nicht billable)', () => {
    for (const k of NONTERMINAL_OPERATIVE_OUTCOME) {
      expect(CLOSED_OPERATIVE_STATUS.has(k), `${k} darf nicht als geschlossen gelten`).toBe(false)
    }
    expect(istClaimGeschlossen({ operativeStatus: 'in_kommunikation_vs' })).toBe(false)
    expect(istClaimGeschlossen({ operativeStatus: 'abgelehnt' })).toBe(false)
  })

  it('abgelehnt (einfach) != abgelehnt_final (terminal)', () => {
    expect(CLOSED_OPERATIVE_STATUS.has('abgelehnt_final')).toBe(true)
    expect(CLOSED_OPERATIVE_STATUS.has('abgelehnt')).toBe(false)
  })
})

describe('istClaimGeschlossen', () => {
  // --- Bug-Repro (FG5): storniert claim mit abgeschlossen_am=null ---
  it('storniert (terminal) ohne abgeschlossen_am → true (bug-repro)', () => {
    expect(istClaimGeschlossen({ operativeStatus: 'storniert' })).toBe(true)
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

  it('aktiver Cursor (in_kommunikation_vs) → false', () => {
    expect(istClaimGeschlossen({ operativeStatus: 'in_kommunikation_vs' })).toBe(false)
  })

  it('leere Args → false', () => {
    expect(istClaimGeschlossen({})).toBe(false)
  })

  it('null-Werte ueberall → false', () => {
    expect(istClaimGeschlossen({ operativeStatus: null, abgeschlossenAm: null })).toBe(false)
  })

  it('reguliert_vollstaendig (feiner Terminal) → true', () => {
    expect(istClaimGeschlossen({ operativeStatus: 'reguliert_vollstaendig' })).toBe(true)
  })

  it('verjaehrt → true', () => {
    expect(istClaimGeschlossen({ operativeStatus: 'verjaehrt' })).toBe(true)
  })

  it('sv-zugewiesen (aktiver Cursor) → false', () => {
    expect(istClaimGeschlossen({ operativeStatus: 'sv-zugewiesen' })).toBe(false)
  })
})
