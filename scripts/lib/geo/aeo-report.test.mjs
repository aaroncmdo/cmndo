import { describe, it, expect } from 'vitest'
import { renderReport } from './aeo-report.mjs'
import { scoreRun } from './aeo-score.mjs'

const results = [
  { query: { id: 'a', text: 'Frage A' }, extract: { claimondo_present: true, claimondo_cited: true, competitors_present: [], competitors_cited: [], no_web_result: false }, scores: { accuracy: 9, sentiment: 8, completeness: 7 } },
  { query: { id: 'b', text: 'Frage B' }, extract: { claimondo_present: false, claimondo_cited: false, competitors_present: ['ADAC'], competitors_cited: ['ADAC'], no_web_result: false }, scores: { accuracy: 5, sentiment: 5, completeness: 4 } },
]

describe('renderReport', () => {
  const md = renderReport({ runDate: '2026-08-03', results, aggregate: scoreRun(results) })
  it('enthält Datum + Aggregat (X/N)', () => {
    expect(md).toContain('2026-08-03')
    expect(md).toContain('1/2')
  })
  it('enthält eine Tabellenzeile je Query', () => {
    expect(md).toContain('Frage A')
    expect(md).toContain('Frage B')
  })
  it('enthält die Gap-Liste mit der verlorenen Query + Wettbewerbern', () => {
    expect(md).toMatch(/Gap-Liste/i)
    expect(md).toContain('Frage B')
    expect(md).toContain('ADAC')
  })
})
