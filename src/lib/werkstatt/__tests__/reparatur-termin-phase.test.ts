import { describe, it, expect } from 'vitest'
import { reparaturTerminPhase } from '../reparatur-termin-phase'

describe('reparaturTerminPhase', () => {
  it('null -> kein_termin/neutral', () => {
    expect(reparaturTerminPhase(null)).toEqual({ key: 'kein_termin', label: 'Kein Reparaturtermin', ton: 'neutral' })
  })
  it('angefragt -> info', () => {
    expect(reparaturTerminPhase('angefragt')).toEqual({ key: 'angefragt', label: 'Wunschtermin angefragt', ton: 'info' })
  })
  it('anruf_erbeten -> info', () => {
    expect(reparaturTerminPhase('anruf_erbeten')).toEqual({ key: 'anruf_erbeten', label: 'Werkstatt meldet sich', ton: 'info' })
  })
  it('bestaetigt -> success', () => {
    expect(reparaturTerminPhase('bestaetigt')).toEqual({ key: 'bestaetigt', label: 'Termin bestätigt', ton: 'success' })
  })
  it('erledigt -> success', () => {
    expect(reparaturTerminPhase('erledigt')).toEqual({ key: 'erledigt', label: 'Reparatur abgeschlossen', ton: 'success' })
  })
  it('abgelehnt -> warning', () => {
    expect(reparaturTerminPhase('abgelehnt')).toEqual({ key: 'abgelehnt', label: 'Termin abgelehnt', ton: 'warning' })
  })
  it('storniert -> neutral', () => {
    expect(reparaturTerminPhase('storniert')).toEqual({ key: 'storniert', label: 'Termin storniert', ton: 'neutral' })
  })
})

// Ops-Test C2-Rest (19.08.): `angefragt` behauptete pauschal einen Wunschtermin.
// Auf prod hatten ALLE sieben offenen Anfragen wunschtermin=NULL.
describe('reparaturTerminPhase — angefragt ohne genannte Wunschzeit', () => {
  it('nennt keinen Wunschtermin, wenn keiner vorliegt', () => {
    expect(reparaturTerminPhase('angefragt', { hatWunschtermin: false })).toEqual({
      key: 'angefragt',
      label: 'Terminanfrage läuft',
      ton: 'info',
    })
  })

  it('bleibt beim Wunschtermin-Text, wenn einer vorliegt', () => {
    expect(reparaturTerminPhase('angefragt', { hatWunschtermin: true }).label).toBe('Wunschtermin angefragt')
  })

  it('ist ohne Option rueckwaertskompatibel', () => {
    expect(reparaturTerminPhase('angefragt').label).toBe('Wunschtermin angefragt')
  })
})
