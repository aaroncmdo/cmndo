// Tests fuer die Fallakte-Section-Visibility.
//
// Anlass (Prod-UI-Smoke 19.07., Session f48be874): Ein Kundenbetreuer konnte
// den Kanzlei-Lifecycle nicht bedienen. Der Prozess-Tab zeigte "0 Trigger-
// Felder", obwohl der Fall fachlich bei der Kanzlei lag
// (operative_status='kanzlei-uebergeben' + kanzlei_faelle-Row vorhanden) —
// weil die Trigger ausschliesslich an `mandatsnummer` / `kanzlei_uebergeben_am`
// haengen und beide NULL waren. Auf prod steht CLM-2026-00837 exakt so.

import { describe, expect, it } from 'vitest'
import { getTriggeredFallSections } from './section-visibility'

const FRUEHE_PHASE = { phase: 1, szenario: null }

describe('getTriggeredFallSections — kanzlei', () => {
  it('triggert bei gesetzter mandatsnummer (Bestandsverhalten)', () => {
    expect(getTriggeredFallSections(FRUEHE_PHASE, { mandatsnummer: 'M-4711' })).toContain('kanzlei')
  })

  it('triggert bei gesetztem kanzlei_uebergeben_am (Bestandsverhalten)', () => {
    expect(
      getTriggeredFallSections(FRUEHE_PHASE, { kanzlei_uebergeben_am: '2026-06-15T00:00:00Z' }),
    ).toContain('kanzlei')
  })

  it('triggert ab Phase 4 (Bestandsverhalten)', () => {
    expect(getTriggeredFallSections({ phase: 4, szenario: null }, {})).toContain('kanzlei')
  })

  // ── der eigentliche Bug ──────────────────────────────────────────────
  it('triggert wenn der Fall fachlich uebergeben ist, auch ohne Datum/Mandatsnummer', () => {
    expect(getTriggeredFallSections(FRUEHE_PHASE, { status: 'kanzlei-uebergeben' })).toContain(
      'kanzlei',
    )
  })

  it('triggert bei sub_phase kanzlei_uebergabe', () => {
    expect(getTriggeredFallSections(FRUEHE_PHASE, { sub_phase: 'kanzlei_uebergabe' })).toContain(
      'kanzlei',
    )
  })

  it('triggert NICHT bei einem Fall ohne Kanzlei-Bezug', () => {
    expect(getTriggeredFallSections(FRUEHE_PHASE, { status: 'erfassung' })).not.toContain('kanzlei')
    expect(getTriggeredFallSections(FRUEHE_PHASE, {})).not.toContain('kanzlei')
  })
})
