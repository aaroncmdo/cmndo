import { describe, it, expect } from 'vitest'
import { selbstzahlerStepIndex, SELBSTZAHLER_STEPS } from '../selbstzahler-stepper'

describe('selbstzahlerStepIndex', () => {
  it('keine Werkstatt -> Schritt "Werkstatt" (1) aktiv', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: false, terminStatus: null, abgeschlossen: false }))
      .toEqual({ currentIndex: 1, abgeschlossen: false })
  })

  it('Werkstatt gewaehlt, kein Termin -> Schritt "Termin" (2)', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: null, abgeschlossen: false }))
      .toEqual({ currentIndex: 2, abgeschlossen: false })
  })

  it('Termin angefragt / anruf_erbeten -> weiter Schritt "Termin" (2)', () => {
    for (const s of ['angefragt', 'anruf_erbeten']) {
      expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: s, abgeschlossen: false }))
        .toEqual({ currentIndex: 2, abgeschlossen: false })
    }
  })

  it('Termin abgelehnt -> zurueck auf "Termin" (2) (neuer Wunschtermin)', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: 'abgelehnt', abgeschlossen: false }))
      .toEqual({ currentIndex: 2, abgeschlossen: false })
  })

  it('Termin bestaetigt -> Schritt "Reparatur" (3), noch nicht abgeschlossen', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: 'bestaetigt', abgeschlossen: false }))
      .toEqual({ currentIndex: 3, abgeschlossen: false })
  })

  it('Termin erledigt -> Reparatur (3) abgeschlossen', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: 'erledigt', abgeschlossen: false }))
      .toEqual({ currentIndex: 3, abgeschlossen: true })
  })

  it('Claim terminal -> Reparatur (3) abgeschlossen (auch ohne Termin-Status)', () => {
    expect(selbstzahlerStepIndex({ hatWerkstatt: true, terminStatus: null, abgeschlossen: true }))
      .toEqual({ currentIndex: 3, abgeschlossen: true })
  })

  it('genau 4 Schritte in der Reihenfolge', () => {
    expect(SELBSTZAHLER_STEPS).toEqual(['schaden', 'werkstatt', 'termin', 'reparatur'])
  })
})
