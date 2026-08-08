// FG5 Cluster 1, Task 1b: Unit-Tests fuer FallKarte.derivePhase
// Bug-Repro: status='storniert' mit abgeschlossen_am=null → sollte 'abschluss' liefern,
// lieferte bisher 'erfassung' (FG5-Bug).
import { describe, expect, it } from 'vitest'
import { derivePhase } from '../FallKarte'

type MinFall = Parameters<typeof derivePhase>[0]

function makeFall(overrides: Partial<MinFall> = {}): MinFall {
  return {
    id: 'test-fall-1',
    claim_id: null,
    claim_nummer: null,
    status: null,
    kennzeichen: null,
    fahrzeug_hersteller: null,
    fahrzeug_modell: null,
    schadens_datum: null,
    ...overrides,
  }
}

describe('derivePhase — FG5 bug-repro + Regression', () => {
  // ── Bug-Repro ─────────────────────────────────────────────────────────────
  it('storniert ohne abgeschlossen_am → abschluss (FG5-Bug-Repro)', () => {
    expect(derivePhase(makeFall({ status: 'storniert', abgeschlossen_am: null }))).toBe('abschluss')
  })

  it('storniert mit abgeschlossen_am → abschluss', () => {
    expect(derivePhase(makeFall({ status: 'storniert', abgeschlossen_am: '2026-06-01T00:00:00Z' }))).toBe('abschluss')
  })

  // ── Regression: bisherige gueltige Pfade duerfen sich nicht aendern ──────
  it('abgeschlossen_am gesetzt → abschluss', () => {
    expect(derivePhase(makeFall({ abgeschlossen_am: '2026-01-01T00:00:00Z' }))).toBe('abschluss')
  })

  it('status=abgeschlossen (operativeStatus) → abschluss', () => {
    expect(derivePhase(makeFall({ status: 'abgeschlossen' }))).toBe('abschluss')
  })

  it('regulierung_am gesetzt → regulierung', () => {
    expect(derivePhase(makeFall({ regulierung_am: '2026-01-01T00:00:00Z' }))).toBe('regulierung')
  })

  it('gutachten_eingegangen_am gesetzt → regulierung', () => {
    expect(derivePhase(makeFall({ gutachten_eingegangen_am: '2026-01-01T00:00:00Z' }))).toBe('regulierung')
  })

  it('sa_unterschrieben=true → begutachtung', () => {
    expect(derivePhase(makeFall({ sa_unterschrieben: true }))).toBe('begutachtung')
  })

  it('kein Signal → erfassung', () => {
    expect(derivePhase(makeFall())).toBe('erfassung')
  })

  // ── Weitere terminale Status ───────────────────────────────────────────────
  it('verjaehrt ohne abgeschlossen_am → abschluss', () => {
    expect(derivePhase(makeFall({ status: 'verjaehrt', abgeschlossen_am: null }))).toBe('abschluss')
  })

  it('reguliert_vollstaendig ohne abgeschlossen_am → abschluss', () => {
    expect(derivePhase(makeFall({ status: 'reguliert_vollstaendig', abgeschlossen_am: null }))).toBe('abschluss')
  })
})

// Gap A (Endkunden-Views "eine Wahrheitsquelle", 05.08.): die Karten-Phase folgt jetzt
// PRIMAER dem operative_status (via phaseForOperativeStatus / OPERATIVE_PHASE-Map) — bit-gleich
// zum Fallakte-Stepper. Diese Faelle waren vorher die Divergenz: ein operativer Mittelphasen-
// Status ohne passendes Sub-Entity-Feld fiel auf 'erfassung' durch, waehrend der Stepper die
// echte Phase zeigte.
describe('derivePhase — Gap A: operative_status treibt die Phase (eine Wahrheitsquelle)', () => {
  it('sv-zugewiesen (Mittelphase) → begutachtung (fiel vorher auf erfassung durch)', () => {
    expect(derivePhase(makeFall({ status: 'sv-zugewiesen' }))).toBe('begutachtung')
  })

  it('besichtigung → begutachtung', () => {
    expect(derivePhase(makeFall({ status: 'besichtigung' }))).toBe('begutachtung')
  })

  it('regulierung-laeuft → regulierung', () => {
    expect(derivePhase(makeFall({ status: 'regulierung-laeuft' }))).toBe('regulierung')
  })

  it('reparatur-laeuft (Direkt-Reparatur-Cursor) → erfassung (main der Reparatur-Lane)', () => {
    expect(derivePhase(makeFall({ status: 'reparatur-laeuft' }))).toBe('erfassung')
  })

  // Der Kern-Gap-A-Beweis: bei gesetztem operative_status gewinnt DIESER, nicht ein voraus-
  // eilendes Sub-Entity-Feld — sonst wuerde die Karte wieder vom Stepper divergieren.
  it('sv-gesucht schlaegt voraus-eilendes sa_unterschrieben → erfassung (nicht begutachtung)', () => {
    expect(derivePhase(makeFall({ status: 'sv-gesucht', sa_unterschrieben: true }))).toBe('erfassung')
  })

  // Fallback bleibt erhalten: OHNE operative_status greift weiter die Sub-Entity-Heuristik.
  it('null operative_status + sa_unterschrieben → begutachtung (Fallback intakt)', () => {
    expect(derivePhase(makeFall({ status: null, sa_unterschrieben: true }))).toBe('begutachtung')
  })
})
