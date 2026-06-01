import { describe, it, expect } from 'vitest'
import {
  mapFallStatusToClaimStatus,
  CLAIMS_TERMINAL_STATES,
} from './fall-status-claim-mapping'

describe('mapFallStatusToClaimStatus', () => {
  describe('Regulierungs-Progression (3-Stufen-Leiter)', () => {
    it('regulierung-laeuft -> in_kommunikation_vs', () => {
      expect(mapFallStatusToClaimStatus('regulierung-laeuft', null)).toEqual({
        setClaimStatus: true,
        value: 'in_kommunikation_vs',
      })
    })
    it('regulierung -> in_kommunikation_vs', () => {
      expect(mapFallStatusToClaimStatus('regulierung', 'in_bearbeitung')).toEqual({
        setClaimStatus: true,
        value: 'in_kommunikation_vs',
      })
    })
    it('zahlung-eingegangen -> KEIN claims.status-Write (reguliert = v_claim_phase-Orphan)', () => {
      // claim_payments.status='erhalten' traegt den Eingang; claims.status bleibt
      // in_kommunikation_vs. 'reguliert' wuerde v_claim_phase keine Phase zuordnen.
      expect(mapFallStatusToClaimStatus('zahlung-eingegangen', 'in_kommunikation_vs')).toEqual({
        setClaimStatus: false,
        value: null,
      })
    })
    it('abgeschlossen -> reguliert_vollstaendig (Happy-Path)', () => {
      expect(mapFallStatusToClaimStatus('abgeschlossen', 'in_kommunikation_vs')).toEqual({
        setClaimStatus: true,
        value: 'reguliert_vollstaendig',
      })
    })
  })

  describe('Terminals / Quasi-Terminals', () => {
    it('storniert -> storniert', () => {
      expect(mapFallStatusToClaimStatus('storniert', 'in_bearbeitung')).toEqual({
        setClaimStatus: true,
        value: 'storniert',
      })
    })
    it('klage -> klage_rechtsstreit', () => {
      expect(mapFallStatusToClaimStatus('klage', 'in_kommunikation_vs')).toEqual({
        setClaimStatus: true,
        value: 'klage_rechtsstreit',
      })
    })
    it('vs-abgelehnt -> abgelehnt (nicht _final — kann -> klage eskalieren)', () => {
      expect(mapFallStatusToClaimStatus('vs-abgelehnt', 'in_kommunikation_vs')).toEqual({
        setClaimStatus: true,
        value: 'abgelehnt',
      })
      expect(CLAIMS_TERMINAL_STATES.has('abgelehnt')).toBe(false)
    })
  })

  describe('abgeschlossen-Guard: bestehenden spezifischeren Terminal nicht clobbern', () => {
    it('klage_rechtsstreit bleibt erhalten (klage -> abgeschlossen)', () => {
      expect(mapFallStatusToClaimStatus('abgeschlossen', 'klage_rechtsstreit')).toEqual({
        setClaimStatus: false,
        value: null,
      })
    })
    it('abgelehnt_final bleibt erhalten', () => {
      expect(mapFallStatusToClaimStatus('abgeschlossen', 'abgelehnt_final')).toEqual({
        setClaimStatus: false,
        value: null,
      })
    })
    it('storniert bleibt erhalten', () => {
      expect(mapFallStatusToClaimStatus('abgeschlossen', 'storniert')).toEqual({
        setClaimStatus: false,
        value: null,
      })
    })
    it('aus nicht-terminalem Stand -> reguliert_vollstaendig', () => {
      expect(mapFallStatusToClaimStatus('abgeschlossen', null).value).toBe('reguliert_vollstaendig')
      expect(mapFallStatusToClaimStatus('abgeschlossen', 'in_kommunikation_vs').value).toBe(
        'reguliert_vollstaendig',
      )
      expect(mapFallStatusToClaimStatus('abgeschlossen', 'abgelehnt').value).toBe(
        'reguliert_vollstaendig',
      )
    })
  })

  describe('Aktive Phasen + Sub-Entity-getragene Zustaende -> kein claims.status-Write', () => {
    const noWrite = [
      'ersterfassung',
      'onboarding',
      'sv-gesucht',
      'sv-zugewiesen',
      'sv-termin',
      'besichtigung',
      'begutachtung-laeuft',
      'gutachten-eingegangen',
      'filmcheck',
      'qc-pruefung',
      'kanzlei-uebergeben',
      'anschlussschreiben',
      'vs-kuerzt',
      'nachbesichtigung-laeuft',
    ]
    it.each(noWrite)('%s -> setClaimStatus=false', (status) => {
      expect(mapFallStatusToClaimStatus(status, 'in_bearbeitung')).toEqual({
        setClaimStatus: false,
        value: null,
      })
    })
  })

  describe('Defensiv', () => {
    it('unbekannter Status -> kein Write', () => {
      expect(mapFallStatusToClaimStatus('voellig-unbekannt', 'in_bearbeitung')).toEqual({
        setClaimStatus: false,
        value: null,
      })
    })
  })
})
