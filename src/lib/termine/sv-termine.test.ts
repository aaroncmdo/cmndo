import { describe, it, expect, vi } from 'vitest'
import { buildSvTermineQuery } from './sv-termine'

function fakeQb() {
  const calls: Array<{ m: string; a: unknown[] }> = []
  const qb: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'order']) {
    qb[m] = vi.fn((...a: unknown[]) => {
      calls.push({ m, a })
      return qb
    })
  }
  ;(qb as { _calls: typeof calls })._calls = calls
  return qb as Record<string, ReturnType<typeof vi.fn>> & { _calls: typeof calls }
}

describe('buildSvTermineQuery', () => {
  it('filtert assignee_id + assignee_typ=sachverstaendiger + status IN + Fenster', () => {
    const qb = fakeQb()
    buildSvTermineQuery(qb, 'sv-1', {
      statuses: ['reserviert', 'bestaetigt'],
      from: '2026-07-01T00:00:00Z',
      to: '2026-08-01T00:00:00Z',
    })
    const eqs = qb._calls.filter((c) => c.m === 'eq').map((c) => c.a)
    expect(eqs).toContainEqual(['assignee_id', 'sv-1'])
    expect(eqs).toContainEqual(['assignee_typ', 'sachverstaendiger'])
    expect(qb._calls.some((c) => c.m === 'in' && c.a[0] === 'status')).toBe(true)
    expect(qb._calls.some((c) => c.m === 'gte' && c.a[0] === 'start_zeit')).toBe(true)
    expect(qb._calls.some((c) => c.m === 'lt' && c.a[0] === 'start_zeit')).toBe(true)
  })

  it('ohne Fenster keine gte/lt', () => {
    const qb = fakeQb()
    buildSvTermineQuery(qb, 'sv-1', { statuses: ['bestaetigt'] })
    expect(qb._calls.some((c) => c.m === 'gte')).toBe(false)
    expect(qb._calls.some((c) => c.m === 'lt')).toBe(false)
  })
})
