import { describe, it, expect } from 'vitest'
import { brauchtKanzleiHandoff, kanzleiHandoffBereitsErfolgt, kanzleiHandoffMoeglich } from './handoff-guard'

// Filmcheck-Audit 29.06.2026: gibKanzleipaketFrei (qc.ts) schrieb nur kanzlei_faelle +
// auftrag, advancte aber operative_status NICHT -> der Fall tauchte in den (operative_
// status-gegateten) Kanzlei-Portalen nie auf. Fix: gibKanzleipaketFrei loest denselben
// operativen Handoff aus wie qcBestanden -> brauchtKanzleiHandoff gated das idempotent.

describe('brauchtKanzleiHandoff', () => {
  it('komplett + vor dem Handoff (gutachten-eingegangen/filmcheck) -> true', () => {
    expect(brauchtKanzleiHandoff('gutachten-eingegangen', 'komplett')).toBe(true)
    expect(brauchtKanzleiHandoff('filmcheck', 'komplett')).toBe(true)
    expect(brauchtKanzleiHandoff('qc-pruefung', 'komplett')).toBe(true)
    expect(brauchtKanzleiHandoff('sv-termin', 'komplett')).toBe(true)
  })

  it('bereits uebergeben/weiter -> false (idempotent, kein Doppel-Handoff)', () => {
    for (const s of ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'regulierung-laeuft', 'zahlung-eingegangen', 'abgeschlossen']) {
      expect(brauchtKanzleiHandoff(s, 'komplett')).toBe(false)
    }
  })

  it('nur_gutachter -> false (keine Kanzlei-Strecke)', () => {
    expect(brauchtKanzleiHandoff('filmcheck', 'nur_gutachter')).toBe(false)
    expect(brauchtKanzleiHandoff('gutachten-eingegangen', 'nur_gutachter')).toBe(false)
  })

  it('storniert -> false (kein Handoff fuer abgebrochene Faelle)', () => {
    expect(brauchtKanzleiHandoff('storniert', 'komplett')).toBe(false)
  })

  it('null/unbekannt -> false', () => {
    expect(brauchtKanzleiHandoff(null, 'komplett')).toBe(false)
    expect(brauchtKanzleiHandoff('filmcheck', null)).toBe(false)
  })
})

describe('kanzleiHandoffBereitsErfolgt (Idempotenz-Guard fuer saveFilmcheck)', () => {
  it('uebergeben/weiter/terminal -> true (Handoff ueberspringen)', () => {
    for (const s of ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'zahlung-eingegangen', 'abgeschlossen', 'storniert']) {
      expect(kanzleiHandoffBereitsErfolgt(s)).toBe(true)
    }
  })
  it('vor dem Handoff (filmcheck/qc-pruefung/frueher) -> false (Handoff erlaubt)', () => {
    for (const s of ['filmcheck', 'qc-pruefung', 'gutachten-eingegangen', 'sv-termin']) {
      expect(kanzleiHandoffBereitsErfolgt(s)).toBe(false)
    }
  })
  it('null -> false', () => {
    expect(kanzleiHandoffBereitsErfolgt(null)).toBe(false)
    expect(kanzleiHandoffBereitsErfolgt(undefined)).toBe(false)
  })
})

describe('kanzleiHandoffMoeglich (Robustheit: Handoff nur aus Filmcheck-Quellstatus)', () => {
  // Filmcheck-Audit 01.07.2026: 'kanzlei-uebergeben' ist laut State-Machine
  // (FALL_STATUS_TRANSITIONS) nur aus 'filmcheck'/'qc-pruefung' erreichbar. saveFilmcheck
  // prueft das VOR transitionFallStatus -> ein komplett-Claim, der noch davorhaengt (z.B.
  // ohne Gutachten in 'begutachtung-laeuft'), bekommt einen sauberen Fehler statt einer 500.
  it('filmcheck/qc-pruefung -> true (gueltiger Quellstatus)', () => {
    expect(kanzleiHandoffMoeglich('filmcheck')).toBe(true)
    expect(kanzleiHandoffMoeglich('qc-pruefung')).toBe(true)
  })
  it('vor dem Filmcheck (noch kein Gutachten) -> false', () => {
    for (const s of ['ersterfassung', 'sv-termin', 'besichtigung', 'begutachtung-laeuft', 'gutachten-eingegangen']) {
      expect(kanzleiHandoffMoeglich(s)).toBe(false)
    }
  })
  it('bereits uebergeben/terminal -> false (kein zweiter Handoff)', () => {
    for (const s of ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'abgeschlossen', 'storniert']) {
      expect(kanzleiHandoffMoeglich(s)).toBe(false)
    }
  })
  it('null/undefined -> false', () => {
    expect(kanzleiHandoffMoeglich(null)).toBe(false)
    expect(kanzleiHandoffMoeglich(undefined)).toBe(false)
  })
})
