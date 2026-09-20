import { describe, it, expect } from 'vitest'
import { klassifiziereReservierungsGrund } from '../reservierung-grund'

// Diagnose-Luecke (Handoff melde-schaden): die harte Reservierung loggte den Grund
// NUR im pm2-Log (kein VPS -> nicht diagnostizierbar). Der Klassifikator mappt die
// interne bucheTerminFlow-Fehlermeldung auf einen SICHEREN Grund-Code fuer die
// API-Response — nie rohe DB-Fehlermeldungen nach aussen.

describe('klassifiziereReservierungsGrund', () => {
  it('Test-Guard-Meldung -> test_sv_guard (der gemeldete Smoke-Fall)', () => {
    expect(
      klassifiziereReservierungsGrund('Test-Guard: echter Kunde darf keinen Test-Sachverstaendigen buchen.'),
    ).toBe('test_sv_guard')
  })

  it('belegt/vergeben -> slot_belegt', () => {
    expect(klassifiziereReservierungsGrund('Slot belegt')).toBe('slot_belegt')
    expect(
      klassifiziereReservierungsGrund('Dieser Termin ist leider gerade vergeben. Bitte wählen Sie einen anderen.'),
    ).toBe('slot_belegt')
  })

  it('ungültig/abgelaufen -> link_ungueltig', () => {
    expect(klassifiziereReservierungsGrund('Dieser Link ist ungültig.')).toBe('link_ungueltig')
  })

  it('unbekannt/roh (z.B. DB-Message) -> nicht_reserviert (KEIN Leak)', () => {
    expect(
      klassifiziereReservierungsGrund('duplicate key value violates unique constraint "gutachter_termine_pkey"'),
    ).toBe('nicht_reserviert')
  })

  it('Engine-Code hat Vorrang vor dem Text: test_guard -> test_sv_guard, belegt -> slot_belegt', () => {
    // Seit 12.08. gibt die Engine beim Guard einen kundentauglichen Text ohne "Test-Guard" zurueck;
    // die Regel-4-Probe vom 20.09. (#5990) sah deshalb 'nicht_reserviert'. Der Engine-Code reist mit.
    const kundentext =
      'Diese Buchung konnte leider nicht abgeschlossen werden. Bitte melden Sie sich kurz bei uns — wir vereinbaren Ihren Termin persönlich.'
    expect(klassifiziereReservierungsGrund(kundentext)).toBe('nicht_reserviert')
    expect(klassifiziereReservierungsGrund(kundentext, 'test_guard')).toBe('test_sv_guard')
    expect(klassifiziereReservierungsGrund('irgendein Text', 'belegt')).toBe('slot_belegt')
    // 'db' sagt nichts Genaueres — dann entscheidet weiterhin der Text.
    expect(klassifiziereReservierungsGrund('Slot belegt', 'db')).toBe('slot_belegt')
    expect(klassifiziereReservierungsGrund('duplicate key value violates unique constraint', 'db')).toBe('nicht_reserviert')
  })

  it('null/leer -> null', () => {
    expect(klassifiziereReservierungsGrund(null)).toBeNull()
    expect(klassifiziereReservierungsGrund('')).toBeNull()
    expect(klassifiziereReservierungsGrund(undefined)).toBeNull()
  })
})
