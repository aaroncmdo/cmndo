import { describe, it, expect } from 'vitest'
import { computeLeadRollup } from './lead-board-rollup'
import type { LeadWorkItem } from './lead-workstate.types'

function item(state: LeadWorkItem['state'], ownerId: string | null = 'd1'): LeadWorkItem {
  return {
    kind: 'lead',
    id: `${state}-${ownerId ?? 'none'}`,
    ownerId,
    ownerName: ownerId ? 'Owner X' : null,
    state,
    qualCompleted: 0,
    display: { title: 't', telefon: null },
  }
}

describe('computeLeadRollup', () => {
  it('zaehlt total, unassigned und byState', () => {
    const r = computeLeadRollup([
      item('rueckruf'),
      item('neu'),
      item('neu', null),
      item('warten', null),
    ])
    expect(r.total).toBe(4)
    expect(r.unassigned).toBe(2)
    expect(r.byState.neu).toBe(2)
    expect(r.byState.rueckruf).toBe(1)
    expect(r.byState.terminal).toBe(0)
  })

  it('leer -> alles null', () => {
    const r = computeLeadRollup([])
    expect(r.total).toBe(0)
    expect(r.unassigned).toBe(0)
    expect(r.byState.flowlink_senden).toBe(0)
  })
})
