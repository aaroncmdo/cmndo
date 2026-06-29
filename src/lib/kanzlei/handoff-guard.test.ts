import { describe, it, expect } from 'vitest'
import { brauchtKanzleiHandoff } from './handoff-guard'

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
