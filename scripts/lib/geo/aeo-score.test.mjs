import { describe, it, expect } from 'vitest'
import { scoreRun } from './aeo-score.mjs'

const mk = (id, present, cited, comps = [], scores = { accuracy: 8, sentiment: 7, completeness: 6 }) => ({
  query: { id, text: id },
  extract: { claimondo_present: present, claimondo_cited: cited, competitors_present: comps, no_web_result: false },
  scores,
})

describe('scoreRun', () => {
  it('zählt Präsenz + Zitate über die Queries', () => {
    const r = scoreRun([mk('a', true, true), mk('b', true, false), mk('c', false, false, ['ADAC'])])
    expect(r.total).toBe(3)
    expect(r.present_count).toBe(2)
    expect(r.cited_count).toBe(1)
  })
  it('listet verlorene Queries (nicht präsent)', () => {
    const r = scoreRun([mk('a', true, true), mk('c', false, false)])
    expect(r.lost.map((q) => q.id)).toEqual(['c'])
    expect(r.won.map((q) => q.id)).toEqual(['a'])
  })
  it('mittelt Judge-Scores nur über nicht-null Werte', () => {
    const r = scoreRun([mk('a', true, true, [], { accuracy: 10, sentiment: 8, completeness: 6 }), mk('b', true, false, [], { accuracy: null, sentiment: null, completeness: null })])
    expect(r.judge_avg.accuracy).toBe(10)
  })
  it('behandelt Error-Queries (kein extract) sicher', () => {
    const r = scoreRun([{ query: { id: 'e', text: 'e' }, error: 'timeout' }])
    expect(r.total).toBe(1)
    expect(r.present_count).toBe(0)
    expect(r.lost.map((q) => q.id)).toEqual(['e'])
  })
})
