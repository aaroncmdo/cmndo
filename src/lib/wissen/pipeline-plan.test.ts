import { describe, it, expect } from 'vitest'
import {
  orderCandidates,
  evergreenRefillCount,
  shouldStopEvergreen,
  articleQuelleForThema,
  type PlanThema,
} from './pipeline-plan'

const t = (id: string, quelle: string): PlanThema => ({
  id,
  quelle,
  titel: id,
  kurzbrief: null,
  primary_keyword: null,
  cluster: null,
  artikel_typ: null,
  source_url: null,
  created_at: '2026-07-06',
})

describe('orderCandidates', () => {
  it('ordnet Crawl vor Manuell vor Evergreen', () => {
    const order = orderCandidates({
      crawl: [t('c1', 'crawl')],
      manuell: [t('m1', 'manuell')],
      evergreen: [t('e1', 'ai_gap'), t('e2', 'ai_gap')],
    })
    expect(order.map((x) => x.id)).toEqual(['c1', 'm1', 'e1', 'e2'])
  })
  it('leere Pools ergeben leere Reihenfolge', () => {
    expect(orderCandidates({ crawl: [], manuell: [], evergreen: [] })).toEqual([])
  })
})

describe('evergreenRefillCount', () => {
  it('füllt bis zum Target auf', () => {
    expect(evergreenRefillCount(1, 6)).toBe(5)
  })
  it('nie negativ (Pool über Target)', () => {
    expect(evergreenRefillCount(8, 6)).toBe(0)
  })
})

describe('shouldStopEvergreen', () => {
  it('stoppt Evergreen wenn Boden erreicht', () => {
    expect(shouldStopEvergreen('ai_gap', 2, 2)).toBe(true)
  })
  it('läuft weiter solange unter Boden', () => {
    expect(shouldStopEvergreen('ai_gap', 1, 2)).toBe(false)
  })
  it('stoppt nie für Crawl/Manuell', () => {
    expect(shouldStopEvergreen('crawl', 5, 2)).toBe(false)
    expect(shouldStopEvergreen('manuell', 5, 2)).toBe(false)
  })
})

describe('articleQuelleForThema', () => {
  it('mappt Provenienz', () => {
    expect(articleQuelleForThema('crawl')).toBe('crawl')
    expect(articleQuelleForThema('manuell')).toBe('redaktion')
    expect(articleQuelleForThema('ai_gap')).toBe('ai_gap')
  })
})
