// src/lib/task-executor/plan.test.ts
import { describe, it, expect } from 'vitest'
import { extractActions, buildPlan } from './plan'
import type { ActionDraft } from './types'
import type Anthropic from '@anthropic-ai/sdk'

describe('extractActions', () => {
  it('mappt gueltige tool_use-Bloecke, ueberspringt ungueltige + text', () => {
    const content = [
      { type: 'text', text: 'egal' },
      { type: 'tool_use', id: 'a', name: 'interne_notiz', input: { text: 'Kunde kontaktiert' } },
      { type: 'tool_use', id: 'b', name: 'interne_notiz', input: { text: 'x' } }, // zu kurz → raus
      { type: 'tool_use', id: 'c', name: 'unbekannt', input: {} },                 // unbekannt → raus
    ] as unknown as Anthropic.ContentBlock[]
    const drafts = extractActions(content)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].verb).toBe('interne_notiz')
  })
})

describe('buildPlan', () => {
  it('leerer Plan bei keinen Drafts', () => {
    const plan = buildPlan([])
    expect(plan.steps).toHaveLength(0)
    expect(plan.hatConsequential).toBe(false)
  })
  it('reiner Safe-Plan → hatConsequential=false, schliessen zuletzt', () => {
    const drafts: ActionDraft[] = [
      { verb: 'task_schliessen', args: { ergebnis: 'ok' } },
      { verb: 'interne_notiz', args: { text: 'geprueft' } },
    ]
    const plan = buildPlan(drafts)
    expect(plan.hatConsequential).toBe(false)
    expect(plan.steps.map((s) => s.verb)).toEqual(['interne_notiz', 'task_schliessen'])
  })
  it('mit Outbound → hatConsequential=true', () => {
    const drafts: ActionDraft[] = [
      { verb: 'sende_kommunikation', args: { trigger: 'dokumente_nachreichen', variablen: {} }, begruendung: 'Doks fehlen' },
      { verb: 'task_schliessen', args: { ergebnis: 'gesendet' } },
    ]
    const plan = buildPlan(drafts)
    expect(plan.hatConsequential).toBe(true)
    expect(plan.steps[0].risk).toBe('consequential')
    expect(plan.steps.at(-1)?.verb).toBe('task_schliessen')
    expect(plan.begruendung).toContain('Doks fehlen')
  })
})
