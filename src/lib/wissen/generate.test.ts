import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, parseDraft } from './generate'

describe('buildSystemPrompt', () => {
  it('enthaelt die Legal-Guardrails', () => {
    const p = buildSystemPrompt({ titel: 'Nutzungsausfall' })
    expect(p).toMatch(/RDG|Handlungsempfehlung/)
    expect(p).toMatch(/BGH/)
    expect(p).toMatch(/Erfinde NIE/)
    expect(p).toMatch(/keine Rechtsberatung/)
  })
})

describe('parseDraft', () => {
  it('akzeptiert vollstaendigen Draft', () => {
    const r = parseDraft(
      JSON.stringify({
        slug: 'x-y',
        title: 'T',
        excerpt: 'e'.repeat(120),
        keyFacts: ['a', 'b', 'c'],
        metaDescription: 'm',
        primaryKeyword: 'k',
        cluster: 'H3',
        body: '# T\n\n> **Kurz erklaert:** ...',
      }),
    )
    expect(r.ok).toBe(true)
  })

  it('lehnt fehlende Felder ab (kein throw)', () => {
    expect(parseDraft('{"title":"T"}').ok).toBe(false)
    expect(parseDraft('nicht json').ok).toBe(false)
  })
})
