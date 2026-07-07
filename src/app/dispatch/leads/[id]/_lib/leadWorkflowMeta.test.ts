import { describe, it, expect } from 'vitest'
import { LEAD_WORKFLOW_META, LEAD_WORKFLOW_SPINE, spineIndexForState } from './leadWorkflowMeta'
import { LEAD_WORKFLOW_DEFS } from '@/lib/status/domains/lead-workflow'
import type { LeadWorkflowState } from './deriveLeadWorkflowState'

// Kanonische Liste der 8 Zustaende — Paritaets-Anker gegen Meta + Registry-Domain.
const ALL_STATES: LeadWorkflowState[] = [
  'neu',
  'qualifizieren',
  'sv_zuweisen',
  'flowlink_senden',
  'nachfassen',
  'warten',
  'rueckruf',
  'terminal',
]

describe('leadWorkflowMeta', () => {
  it('META deckt exakt die 8 Zustaende ab', () => {
    expect(Object.keys(LEAD_WORKFLOW_META).sort()).toEqual([...ALL_STATES].sort())
  })

  it('jeder Nicht-terminal-Zustand hat einen CTA; terminal ist read-only (leer)', () => {
    for (const s of ALL_STATES) {
      if (s === 'terminal') expect(LEAD_WORKFLOW_META[s].ctaLabel).toBe('')
      else expect(LEAD_WORKFLOW_META[s].ctaLabel.length).toBeGreaterThan(0)
    }
  })

  it('jeder Zustand hat Titel + Beschreibung', () => {
    for (const s of ALL_STATES) {
      expect(LEAD_WORKFLOW_META[s].heroTitle.length).toBeGreaterThan(0)
      expect(LEAD_WORKFLOW_META[s].heroDescription.length).toBeGreaterThan(0)
    }
  })

  it('spineIndexForState liefert einen gueltigen Meilenstein-Index (0..len-1)', () => {
    for (const s of ALL_STATES) {
      const idx = spineIndexForState(s)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(LEAD_WORKFLOW_SPINE.length)
    }
  })

  it('terminal steht am Ende der Schiene', () => {
    expect(spineIndexForState('terminal')).toBe(LEAD_WORKFLOW_SPINE.length - 1)
  })

  it('Registry-Paritaet: lead-workflow-Domain deckt exakt die 8 Zustaende ab', () => {
    expect(Object.keys(LEAD_WORKFLOW_DEFS).sort()).toEqual([...ALL_STATES].sort())
  })

  it('terminal ist als Endzustand markiert', () => {
    expect(LEAD_WORKFLOW_DEFS.terminal.isEndzustand).toBe(true)
  })
})
