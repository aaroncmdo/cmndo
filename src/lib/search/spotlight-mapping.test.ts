import { describe, it, expect } from 'vitest'
import { mapGroupsToSpotlight } from './spotlight-mapping'
import type { SearchGroup } from './types'

describe('mapGroupsToSpotlight', () => {
  it('mappt SearchGroup -> SpotlightGroup mit Label/Key/Results', () => {
    const groups: SearchGroup[] = [
      { entityType: 'claim', hits: [{ entity_type: 'claim', id: 'c1', label: 'CLM-1', sub: 'B-MW-123', status: 'offen', score: 0.9 }] },
      { entityType: 'lead', hits: [{ entity_type: 'lead', id: 'l1', label: 'Max Muster', sub: null, status: 'neu', score: 0.6 }] },
    ]
    const out = mapGroupsToSpotlight(groups)
    expect(out.map((g) => g.key)).toEqual(['claim', 'lead'])
    expect(out[0].label).toBe('Fälle')
    expect(out[1].label).toBe('Leads')
    expect(out[0].results[0]).toMatchObject({ id: 'c1', label: 'CLM-1', sub: 'B-MW-123', status: 'offen' })
    // null sub/status werden zu undefined (SpotlightResult-Shape)
    expect(out[1].results[0].sub).toBeUndefined()
  })

  it('leere Gruppen -> leeres Array', () => {
    expect(mapGroupsToSpotlight([])).toEqual([])
  })
})
