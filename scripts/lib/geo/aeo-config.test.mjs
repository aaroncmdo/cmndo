import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const cfg = JSON.parse(readFileSync(new URL('./aeo-queries.json', import.meta.url)))

describe('aeo-queries config', () => {
  it('hat genau 15 Queries (10 Tag-0 + 5 Journey)', () => {
    expect(cfg.queries).toHaveLength(15)
  })
  it('jede Query hat id/text/cluster/relevanz', () => {
    for (const q of cfg.queries) {
      expect(typeof q.id).toBe('string')
      expect(q.text.length).toBeGreaterThan(3)
      expect(['awareness', 'consideration', 'decision', 'trust', 'branded']).toContain(q.cluster)
    }
  })
  it('Wettbewerber haben name + domains[]', () => {
    expect(cfg.competitors.length).toBeGreaterThanOrEqual(5)
    for (const c of cfg.competitors) {
      expect(typeof c.name).toBe('string')
      expect(Array.isArray(c.domains)).toBe(true)
    }
  })
})
