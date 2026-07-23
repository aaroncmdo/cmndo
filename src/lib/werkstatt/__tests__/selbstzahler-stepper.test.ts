import { describe, it, expect } from 'vitest'
import { selbstzahlerStepIndex, SELBSTZAHLER_STEPS } from '../selbstzahler-stepper'

describe('selbstzahlerStepIndex', () => {
  it('keine Werkstatt -> Schritt "Werkstatt" (1) aktiv', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: false, terminStatus: null, kvaFreigegeben: false, abgeschlossen: false }))
      .toEqual({ currentIndex: 1, abgeschlossen: false })
  })

  it('Werkstatt gewaehlt, kein Termin -> Schritt "Termin" (2)', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: null, kvaFreigegeben: false, abgeschlossen: false }))
      .toEqual({ currentIndex: 2, abgeschlossen: false })
  })

  it('Termin angefragt / anruf_erbeten -> weiter Schritt "Termin" (2)', () => {
    for (const s of ['angefragt', 'anruf_erbeten']) {
      expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: s, kvaFreigegeben: false, abgeschlossen: false }))
        .toEqual({ currentIndex: 2, abgeschlossen: false })
    }
  })

  it('Termin abgelehnt -> zurueck auf "Termin" (2) (neuer Wunschtermin)', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: 'abgelehnt', kvaFreigegeben: false, abgeschlossen: false }))
      .toEqual({ currentIndex: 2, abgeschlossen: false })
  })

  it('Termin bestaetigt + KVA NICHT freigegeben -> "Freigabe" (3), NICHT Reparatur', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: 'bestaetigt', kvaFreigegeben: false, abgeschlossen: false }))
      .toEqual({ currentIndex: 3, abgeschlossen: false })
  })

  it('Termin bestaetigt + KVA freigegeben -> "Reparatur" (4) laeuft', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: 'bestaetigt', kvaFreigegeben: true, abgeschlossen: false }))
      .toEqual({ currentIndex: 4, abgeschlossen: false })
  })

  it('Termin erledigt -> Reparatur (4) abgeschlossen', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: 'erledigt', kvaFreigegeben: true, abgeschlossen: false }))
      .toEqual({ currentIndex: 4, abgeschlossen: true })
  })

  it('Claim terminal -> Reparatur (4) abgeschlossen (auch ohne Termin-Status)', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: null, kvaFreigegeben: false, abgeschlossen: true }))
      .toEqual({ currentIndex: 4, abgeschlossen: true })
  })

  it('genau 5 Schritte in der Reihenfolge (mit Freigabe vor Reparatur)', () => {
    expect(SELBSTZAHLER_STEPS).toEqual(['schaden', 'werkstatt', 'termin', 'freigabe', 'reparatur'])
  })
})
