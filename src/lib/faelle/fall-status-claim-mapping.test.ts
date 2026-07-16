import { describe, it, expect } from 'vitest'
import { resolveCursorOperativeStatus, CLAIMS_TERMINAL_STATES } from './fall-status-claim-mapping'

// T3-S4: mapFallStatusToClaimStatus ist entfernt (claims.status wird nicht mehr geschrieben).
// resolveCursorOperativeStatus traegt jetzt beides direkt auf der operative-Achse:
// Klage-Feinterminal-Konvergenz + Terminal-Clobber-Guard (2. Param = currentOperativeStatus).
describe('resolveCursorOperativeStatus', () => {
  describe('Klage-Feinterminal (Konvergenz mit endzustand markClaimAsKlage)', () => {
    it('klage -> klage_rechtsstreit (unabhaengig vom aktuellen Cursor)', () => {
      expect(resolveCursorOperativeStatus('klage', 'in_kommunikation_vs')).toBe('klage_rechtsstreit')
      expect(resolveCursorOperativeStatus('klage', null)).toBe('klage_rechtsstreit')
      expect(resolveCursorOperativeStatus('klage', 'regulierung')).toBe('klage_rechtsstreit')
    })
  })

  describe('Terminal-Clobber-Guard: abgeschlossen ueberschreibt feinen Terminal nicht', () => {
    it('klage -> abgeschlossen: klage_rechtsstreit bleibt erhalten', () => {
      expect(resolveCursorOperativeStatus('abgeschlossen', 'klage_rechtsstreit')).toBe('klage_rechtsstreit')
    })
    it('abgelehnt_final bleibt erhalten', () => {
      expect(resolveCursorOperativeStatus('abgeschlossen', 'abgelehnt_final')).toBe('abgelehnt_final')
    })
    it('storniert bleibt erhalten (kein Un-Storno via Happy-Path)', () => {
      expect(resolveCursorOperativeStatus('abgeschlossen', 'storniert')).toBe('storniert')
    })
    it('reguliert_vollstaendig bleibt erhalten (Re-Close vergroebert nicht)', () => {
      expect(resolveCursorOperativeStatus('abgeschlossen', 'reguliert_vollstaendig')).toBe('reguliert_vollstaendig')
    })
    it('abgeschlossen -> abgeschlossen bleibt idempotent (abgeschlossen ist NICHT im Guard-Set)', () => {
      expect(resolveCursorOperativeStatus('abgeschlossen', 'abgeschlossen')).toBe('abgeschlossen')
      expect(CLAIMS_TERMINAL_STATES.has('abgeschlossen')).toBe(false)
    })
    it('aus aktivem/non-terminalem Stand -> abgeschlossen', () => {
      expect(resolveCursorOperativeStatus('abgeschlossen', null)).toBe('abgeschlossen')
      expect(resolveCursorOperativeStatus('abgeschlossen', 'in_kommunikation_vs')).toBe('abgeschlossen')
      // abgelehnt (einfach) ist non-terminal (nachforderbar) — darf regulaer abschliessen.
      expect(resolveCursorOperativeStatus('abgeschlossen', 'abgelehnt')).toBe('abgeschlossen')
      expect(CLAIMS_TERMINAL_STATES.has('abgelehnt')).toBe(false)
    })
  })

  describe('Normalfall: Cursor-Semantik (Ziel-fall_status geht durch)', () => {
    it.each([
      ['storniert', 'in_kommunikation_vs'],
      ['vs-abgelehnt', 'regulierung'],
      ['regulierung', 'gutachten-eingegangen'],
      ['sv-termin', null],
      ['zahlung-eingegangen', 'in_kommunikation_vs'],
      ['ersterfassung', null],
    ] as const)('%s -> unveraendert', (newStatus, current) => {
      expect(resolveCursorOperativeStatus(newStatus, current)).toBe(newStatus)
    })
  })

  describe('CLAIMS_TERMINAL_STATES (Guard-Set = die 7 feinen Terminals)', () => {
    it('enthaelt genau die feinen Terminals', () => {
      expect([...CLAIMS_TERMINAL_STATES].sort()).toEqual([
        'abgelehnt_final',
        'an_externe_kanzlei_uebergeben',
        'klage_rechtsstreit',
        'reguliert_vollstaendig',
        'storniert',
        'termin_durchgefuehrt',
        'verjaehrt',
      ])
    })
  })
})
