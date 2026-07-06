import { describe, it, expect } from 'vitest'
import { validateToolCall, ORCHESTRATOR_TOOLS } from './tools'

describe('validateToolCall', () => {
  it('akzeptiert gültigen propose_task an erlaubte Rolle', () => {
    const r = validateToolCall('propose_task', { ziel_rolle: 'kundenbetreuer', titel: 'Kunde anrufen', begruendung: 'seit 6 Tagen still' })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.draft.vorschlagTyp).toBe('task'); expect(r.draft.zielRolle).toBe('kundenbetreuer') }
  })
  it('lehnt unerlaubte Rolle ab', () => {
    const r = validateToolCall('propose_task', { ziel_rolle: 'kunde', titel: 'x', begruendung: 'y' })
    expect(r.ok).toBe(false)
  })
  it('lehnt fehlenden Titel ab', () => {
    const r = validateToolCall('propose_task', { ziel_rolle: 'admin', begruendung: 'y' })
    expect(r.ok).toBe(false)
  })
  it('lehnt unbekanntes Tool ab', () => {
    const r = validateToolCall('drop_table', {})
    expect(r.ok).toBe(false)
  })
  it('exponiert die drei Tools an die API', () => {
    expect(ORCHESTRATOR_TOOLS.map((t) => t.name).sort()).toEqual(['flag_escalation', 'propose_task', 'suggest_next_step'])
  })
})
