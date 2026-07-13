import { describe, it, expect } from 'vitest'
import { resolveAdhocAnforderungStatus } from './adhoc-status'

// expires_at weit in der Zukunft / Vergangenheit; `now` wird injiziert.
const NOW = Date.parse('2026-07-13T20:00:00Z')
const FUTURE = '2026-08-01T00:00:00Z'
const PAST = '2026-07-01T00:00:00Z'

describe('resolveAdhocAnforderungStatus', () => {
  it('gesendet (nicht abgelaufen) -> offen, aktionsfaehig, "Ausstehend"', () => {
    const r = resolveAdhocAnforderungStatus('gesendet', FUTURE, NOW)
    expect(r.canAct).toBe(true)
    expect(r.toneKey).toBe('open')
    expect(r.label).toBe('Ausstehend')
    expect(r.expired).toBe(false)
  })

  it('gesendet (abgelaufen) -> weiterhin aktionsfaehig, Warnton, "Abgelaufen"', () => {
    const r = resolveAdhocAnforderungStatus('gesendet', PAST, NOW)
    expect(r.canAct).toBe(true)
    expect(r.toneKey).toBe('expired')
    expect(r.label).toBe('Abgelaufen')
    expect(r.expired).toBe(true)
  })

  it('komplett -> erledigt, keine Aktionen, "Erhalten"', () => {
    const r = resolveAdhocAnforderungStatus('komplett', FUTURE, NOW)
    expect(r.canAct).toBe(false)
    expect(r.toneKey).toBe('done')
    expect(r.label).toBe('Erhalten')
  })

  it('abgelaufen -> terminal, keine Aktionen, "Abgelaufen"', () => {
    const r = resolveAdhocAnforderungStatus('abgelaufen', PAST, NOW)
    expect(r.canAct).toBe(false)
    expect(r.toneKey).toBe('terminal')
    expect(r.label).toBe('Abgelaufen')
  })

  it('teilweise -> offen, aktionsfaehig', () => {
    const r = resolveAdhocAnforderungStatus('teilweise', FUTURE, NOW)
    expect(r.canAct).toBe(true)
    expect(r.toneKey).toBe('open')
    expect(r.label).toBe('Teilweise')
  })

  it('Regression: der neu-gueltige "gesendet"-Zustand ist aktionsfaehig (der Bug: canAct haengte am toten "pending")', () => {
    // Vor dem Fix: canAct = status === 'pending' -> fuer jede echte (gesendet-)Row false.
    expect(resolveAdhocAnforderungStatus('gesendet', FUTURE, NOW).canAct).toBe(true)
    // Unbekannter/Legacy-Wert faellt sicher auf offen-Default (kein Crash, kein "stuck").
    expect(resolveAdhocAnforderungStatus('pending', FUTURE, NOW).canAct).toBe(true)
    expect(resolveAdhocAnforderungStatus('pending', FUTURE, NOW).toneKey).toBe('open')
  })
})
