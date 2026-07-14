import { describe, it, expect } from 'vitest'
import { dedupeAndGroup } from './parse-results'
import type { SearchHit } from './types'

const hit = (o: Partial<SearchHit>): SearchHit => ({
  entity_type: 'claim', id: 'x', label: 'l', sub: null, status: null, score: 0.5, ...o,
})

describe('dedupeAndGroup', () => {
  it('dedupliziert denselben Fall (claim_nummer + kennzeichen), hoechster score gewinnt', () => {
    const groups = dedupeAndGroup([hit({ id: 'c1', score: 0.4 }), hit({ id: 'c1', score: 0.9 })])
    const claims = groups.find(g => g.entityType === 'claim')!
    expect(claims.hits).toHaveLength(1)
    expect(claims.hits[0].score).toBe(0.9)
  })

  it('gruppiert nach entity_type und sortiert je Gruppe nach score', () => {
    const groups = dedupeAndGroup([
      hit({ id: 'c1', score: 0.3 }),
      hit({ id: 'c2', score: 0.8 }),
      hit({ entity_type: 'lead', id: 'l1', score: 0.7 }),
    ])
    expect(groups.map(g => g.entityType)).toEqual(['claim', 'lead'])
    const claims = groups.find(g => g.entityType === 'claim')!
    expect(claims.hits.map(h => h.id)).toEqual(['c2', 'c1'])
  })

  it('leere Eingabe -> leere Gruppen', () => {
    expect(dedupeAndGroup([])).toEqual([])
  })
})
