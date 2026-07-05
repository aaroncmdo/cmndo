import { describe, it, expect } from 'vitest'
import { istGueltigerFallUebergang } from '../state-machine'

// Pure Vorab-Check fuer den fall_geschlossen-All-or-Nothing-Guard (process-event.ts):
// 'abgeschlossen' ist laut FALL_STATUS_TRANSITIONS nur aus regulierung / klage /
// zahlung-eingegangen erreichbar. Aus jedem anderen Status ist der Abschluss ungueltig
// und darf KEINE Abschluss-Spalten schreiben.
describe('istGueltigerFallUebergang', () => {
  it('erlaubt Abschluss aus den 3 terminalen Quell-Status', () => {
    expect(istGueltigerFallUebergang('zahlung-eingegangen', 'abgeschlossen')).toBe(true)
    expect(istGueltigerFallUebergang('regulierung', 'abgeschlossen')).toBe(true)
    expect(istGueltigerFallUebergang('klage', 'abgeschlossen')).toBe(true)
  })

  it('lehnt Abschluss aus nicht-terminalem Status ab', () => {
    expect(istGueltigerFallUebergang('anschlussschreiben', 'abgeschlossen')).toBe(false)
    expect(istGueltigerFallUebergang('sv-termin', 'abgeschlossen')).toBe(false)
    expect(istGueltigerFallUebergang('regulierung-laeuft', 'abgeschlossen')).toBe(false)
  })

  it('lehnt null/undefined/unbekannten Status ab', () => {
    expect(istGueltigerFallUebergang(null, 'abgeschlossen')).toBe(false)
    expect(istGueltigerFallUebergang(undefined, 'abgeschlossen')).toBe(false)
    // war der reale Halb-Schliessungs-Bug (claims.status, kein State-Machine-Key)
    expect(istGueltigerFallUebergang('in_kommunikation_vs', 'abgeschlossen')).toBe(false)
  })

  it('validiert auch andere Uebergaenge korrekt', () => {
    expect(istGueltigerFallUebergang('sv-termin', 'besichtigung')).toBe(true)
    expect(istGueltigerFallUebergang('ersterfassung', 'abgeschlossen')).toBe(false)
    expect(istGueltigerFallUebergang('abgeschlossen', 'ersterfassung')).toBe(false) // terminal
  })
})
