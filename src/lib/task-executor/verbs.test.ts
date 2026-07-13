// src/lib/task-executor/verbs.test.ts
import { describe, it, expect } from 'vitest'
import { validateActionCall, EXECUTOR_VERBS } from './verbs'

describe('validateActionCall', () => {
  it('akzeptiert gueltige interne_notiz', () => {
    const r = validateActionCall('interne_notiz', { text: 'Kunde erinnert' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft.verb).toBe('interne_notiz')
  })
  it('lehnt zu kurzen Notiz-Text ab', () => {
    const r = validateActionCall('interne_notiz', { text: 'x' })
    expect(r.ok).toBe(false)
  })
  it('akzeptiert sende_kommunikation nur mit erlaubtem Trigger', () => {
    const ok = validateActionCall('sende_kommunikation', { trigger: 'dokumente_nachreichen', variablen: {} })
    expect(ok.ok).toBe(true)
    const bad = validateActionCall('sende_kommunikation', { trigger: 'drop_table', variablen: {} })
    expect(bad.ok).toBe(false)
  })
  it('akzeptiert setze_status nur mit bekanntem Zielstatus', () => {
    const ok = validateActionCall('setze_status', { neuer_status: 'sv-gesucht', grund: 'kein SV' })
    expect(ok.ok).toBe(true)
    const bad = validateActionCall('setze_status', { neuer_status: 'phantasie', grund: 'x' })
    expect(bad.ok).toBe(false)
  })
  it('lehnt unbekanntes Verb ab', () => {
    expect(validateActionCall('rm_rf', {}).ok).toBe(false)
  })
  it('exponiert genau 4 Verben mit korrekten Risk-Klassen', () => {
    const byName = Object.fromEntries(EXECUTOR_VERBS.map((v) => [v.name, v.risk]))
    expect(byName).toEqual({
      interne_notiz: 'safe',
      task_schliessen: 'safe',
      sende_kommunikation: 'consequential',
      setze_status: 'consequential',
    })
  })
})
