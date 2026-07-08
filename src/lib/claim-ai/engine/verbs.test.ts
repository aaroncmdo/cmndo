import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { type VerbDefinition, toolsFrom, validateVerb } from './verbs'

const dummyTool: Anthropic.Tool = {
  name: 'do_x',
  description: 'x',
  input_schema: { type: 'object', properties: {}, required: [] },
}
const verbs: VerbDefinition<{ v: string }>[] = [
  {
    name: 'do_x',
    tool: dummyTool,
    validate: (input) => {
      const i = input as { val?: string }
      if (!i?.val) return { ok: false, error: 'val fehlt' }
      return { ok: true, draft: { v: i.val } }
    },
  },
]

describe('validateVerb', () => {
  it('validiert ein bekanntes Verb → draft', () => {
    const r = validateVerb(verbs, 'do_x', { val: 'a' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft).toEqual({ v: 'a' })
  })
  it('gibt den verb-eigenen Fehler bei invalider Eingabe', () => {
    const r = validateVerb(verbs, 'do_x', {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('val fehlt')
  })
  it('unbekanntes Verb → error', () => {
    const r = validateVerb(verbs, 'nope', {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('unbekanntes Tool: nope')
  })
})

describe('toolsFrom', () => {
  it('extrahiert die Anthropic-Tool-Definitionen', () => {
    expect(toolsFrom(verbs)).toEqual([dummyTool])
  })
})
