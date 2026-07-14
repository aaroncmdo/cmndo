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
    expect(istGueltigerFallUebergang('gibt-es-nicht', 'abgeschlossen')).toBe(false)
  })

  it('validiert auch andere Uebergaenge korrekt', () => {
    expect(istGueltigerFallUebergang('sv-termin', 'besichtigung')).toBe(true)
    expect(istGueltigerFallUebergang('ersterfassung', 'abgeschlossen')).toBe(false)
    expect(istGueltigerFallUebergang('abgeschlossen', 'ersterfassung')).toBe(false) // terminal
  })

  // ── B4-slice-1b (Status-Achsen-Konsolidierung) ────────────────────────────
  // Die beiden NICHT-terminalen Endzustand-Outcomes (endzustand-actions:
  // markClaimAsInKommunikationVs / markClaimAsAbgelehnt(final=false)) tragen seit
  // slice-1b operative_status DIREKT — sie sind damit CURSOR-Werte und brauchen
  // Ausgaenge. Vorher waren sie reine claims.status-Werte und standen NIE im Cursor;
  // der fruehere Test hielt hier bewusst `false` fest (Halb-Schliessungs-Bug: es wurde
  // die falsche Achse in die Map gegeben). Die Achse ist repointet (process-event.ts:724
  // liest operative_status), also ist der Schutz gegenstandslos — und ein fehlender Key
  // waere jetzt ein Dead-End: transitionFallStatus WIRFT (:120) und der LexDrive-
  // fall_geschlossen-Guard (process-event.ts:725) lehnt jeden Abschluss ab.
  describe('Non-Terminal-Outcomes als Cursor-Werte', () => {
    it('erlaubt den Abschluss aus in_kommunikation_vs (LexDrive fall_geschlossen-Guard)', () => {
      expect(istGueltigerFallUebergang('in_kommunikation_vs', 'abgeschlossen')).toBe(true)
      expect(istGueltigerFallUebergang('abgelehnt', 'abgeschlossen')).toBe(true)
    })

    it('erhaelt die Ausgaenge der Cursor-Werte, die sie ersetzen (behavior-preserving)', () => {
      // in_kommunikation_vs ersetzt regulierung / regulierung-laeuft
      // (mapFallStatusToClaimStatus) -> deren Ausgaenge muessen erhalten bleiben.
      for (const ziel of ['zahlung-eingegangen', 'nachbesichtigung-laeuft', 'vs-kuerzt', 'vs-abgelehnt', 'klage', 'storniert']) {
        expect(istGueltigerFallUebergang('in_kommunikation_vs', ziel), `in_kommunikation_vs -> ${ziel}`).toBe(true)
      }
      // abgelehnt (einfach, nachforderbar) — eskalierbar + zahlbar + schliessbar.
      for (const ziel of ['zahlung-eingegangen', 'nachbesichtigung-laeuft', 'vs-kuerzt', 'klage', 'storniert']) {
        expect(istGueltigerFallUebergang('abgelehnt', ziel), `abgelehnt -> ${ziel}`).toBe(true)
      }
    })

    it('bleibt ein Guard: keine Rueckwaerts-/Unsinns-Spruenge', () => {
      expect(istGueltigerFallUebergang('in_kommunikation_vs', 'ersterfassung')).toBe(false)
      expect(istGueltigerFallUebergang('in_kommunikation_vs', 'sv-termin')).toBe(false)
      expect(istGueltigerFallUebergang('abgelehnt', 'ersterfassung')).toBe(false)
    })
  })
})
