import { describe, it, expect } from 'vitest'
import {
  mapFallStatusToClaimStatus,
  resolveCursorOperativeStatus,
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
})

// B4-slice-2a-i: die Klage-Terminal-Konvergenz auf der operative_status-Achse.
describe('resolveCursorOperativeStatus', () => {
  // Der Kern: uebergebeFallKlage (state-machine) und markClaimAsKlage (endzustand) schreiben
  // BEIDE den Klage-Terminal — muessen also denselben operative_status tragen, sonst leitet
  // die Achse nach dem status-Read-Drop (slice-2a-ii) unterschiedliche Phasen ab.
  it('Klage: newStatus=klage + status wird klage_rechtsstreit -> op=klage_rechtsstreit', () => {
    const m = mapFallStatusToClaimStatus('klage', 'in_kommunikation_vs')
    const resulting = m.setClaimStatus ? m.value : 'in_kommunikation_vs'
    expect(resolveCursorOperativeStatus('klage', resulting)).toBe('klage_rechtsstreit')
  })

  it('Klage-Erhalt: klage -> abgeschlossen (Guard: status bleibt klage_rechtsstreit) -> op bleibt klage_rechtsstreit', () => {
    // mapFallStatusToClaimStatus('abgeschlossen','klage_rechtsstreit') = NO_WRITE -> resulting = bestehender
    const m = mapFallStatusToClaimStatus('abgeschlossen', 'klage_rechtsstreit')
    const resulting = m.setClaimStatus ? m.value : 'klage_rechtsstreit'
    expect(resolveCursorOperativeStatus('abgeschlossen', resulting)).toBe('klage_rechtsstreit')
  })

  it('Normalfall abgeschlossen (status=reguliert_vollstaendig) -> op bleibt abgeschlossen (KEIN Flip)', () => {
    // Der Normalfall braucht keine Konvergenz: OPERATIVE_PHASE['abgeschlossen']=erfolgreich_reguliert
    // deckt ihn nach dem Drop ab. Nur der Klage-Sonderfall wird geflippt.
    expect(resolveCursorOperativeStatus('abgeschlossen', 'reguliert_vollstaendig')).toBe('abgeschlossen')
  })

  it('storniert / vs-abgelehnt / regulierung -> unveraendert (nur Klage divergiert)', () => {
    expect(resolveCursorOperativeStatus('storniert', 'storniert')).toBe('storniert')
    expect(resolveCursorOperativeStatus('vs-abgelehnt', 'abgelehnt')).toBe('vs-abgelehnt')
    expect(resolveCursorOperativeStatus('regulierung', 'in_kommunikation_vs')).toBe('regulierung')
    expect(resolveCursorOperativeStatus('sv-termin', null)).toBe('sv-termin')
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
