import { describe, it, expect } from 'vitest'
import { validateClaimAiToolCall, extractClaimAiDrafts, VERB_KIND } from './verbs'

describe('validateClaimAiToolCall', () => {
  it('parst propose_task zu task-draft', () => {
    const r = validateClaimAiToolCall('propose_task', {
      ziel_rolle: 'kundenbetreuer', titel: 'Kunde anrufen', begruendung: 'seit 5 Tagen keine Antwort',
    })
    expect(r).toEqual({ ok: true, draft: { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', payload: { titel: 'Kunde anrufen' }, begruendung: 'seit 5 Tagen keine Antwort' } })
  })
  it('parst propose_draft_message zu draft_message-draft', () => {
    const r = validateClaimAiToolCall('propose_draft_message', {
      kanal: 'email', text: 'Sehr geehrte…', begruendung: 'Nachfrage Unterlagen',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft.vorschlagTyp).toBe('draft_message')
  })
  it('lehnt zu kurzen Titel ab', () => {
    const r = validateClaimAiToolCall('propose_task', { ziel_rolle: 'admin', titel: 'x', begruendung: 'y' })
    expect(r.ok).toBe(false)
  })
  it('lehnt unbekanntes Tool ab', () => {
    expect(validateClaimAiToolCall('foo', {}).ok).toBe(false)
  })
  it('extractClaimAiDrafts filtert text-Bloecke + invalide raus', () => {
    const drafts = extractClaimAiDrafts([
      { type: 'text', text: 'hallo' },
      { type: 'tool_use', id: '1', name: 'propose_add_note', input: { titel: 'Notiz', text: 'geprüft', begruendung: 'Doku vollständig' } },
      { type: 'tool_use', id: '2', name: 'propose_task', input: { ziel_rolle: 'admin' } }, // invalide
    ] as never)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].vorschlagTyp).toBe('add_note')
  })
  it('VERB_KIND mappt korrekt', () => {
    expect(VERB_KIND).toEqual({ task: 'task', add_note: 'auto', draft_message: 'draft' })
  })
})
