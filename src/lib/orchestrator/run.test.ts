import { describe, it, expect } from 'vitest'
import { extractProposalsFromToolUse } from './run'

describe('extractProposalsFromToolUse', () => {
  it('mappt gültige tool_use-Blöcke auf Drafts, überspringt Text + Ungültiges', () => {
    const blocks = [
      { type: 'text', text: 'denke nach' },
      { type: 'tool_use', name: 'propose_task', id: 't1', input: { ziel_rolle: 'kundenbetreuer', titel: 'Kunde anrufen', begruendung: 'still' } },
      { type: 'tool_use', name: 'propose_task', id: 't2', input: { ziel_rolle: 'kunde', titel: 'x', begruendung: 'y' } }, // ungültige Rolle
    ] as never[]
    const drafts = extractProposalsFromToolUse(blocks)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].vorschlagTyp).toBe('task')
  })
  it('gibt [] bei keinen tool_use-Blöcken', () => {
    expect(extractProposalsFromToolUse([{ type: 'text', text: 'x' }] as never[])).toEqual([])
  })
})
