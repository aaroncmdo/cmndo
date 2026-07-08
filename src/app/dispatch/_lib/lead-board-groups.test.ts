import { describe, it, expect } from 'vitest'
import { groupLeadWorkItemsByState, LEAD_BOARD_STATE_ORDER } from './lead-board-groups'
import type { LeadWorkItem } from './lead-workstate.types'

function item(id: string, state: LeadWorkItem['state']): LeadWorkItem {
  return { kind: 'lead', id, ownerId: null, state, qualCompleted: 0, display: { title: id, telefon: null } }
}

describe('groupLeadWorkItemsByState', () => {
  it('gruppiert nach state in Board-Reihenfolge; leere Gruppen entfallen', () => {
    const groups = groupLeadWorkItemsByState([
      item('a', 'warten'),
      item('b', 'neu'),
      item('c', 'neu'),
      item('d', 'rueckruf'),
    ])
    // Board-Order (rueckruf < neu < warten), nur nicht-leere Gruppen
    expect(groups.map((g) => g.state)).toEqual(['rueckruf', 'neu', 'warten'])
    expect(groups.find((g) => g.state === 'neu')!.items).toHaveLength(2)
  })

  it('leere Eingabe -> keine Gruppen', () => {
    expect(groupLeadWorkItemsByState([])).toEqual([])
  })

  it('alle 8 Workflow-Zustaende sind in der Board-Reihenfolge', () => {
    expect(LEAD_BOARD_STATE_ORDER).toHaveLength(8)
    expect(new Set(LEAD_BOARD_STATE_ORDER).size).toBe(8)
  })
})
