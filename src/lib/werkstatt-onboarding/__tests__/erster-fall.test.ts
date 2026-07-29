import { describe, it, expect } from 'vitest'
import { hatErstenFall } from '../erster-fall'

// mockt die zwei Supabase-Count-Ketten: partner_provisionen (.select.eq.eq) + claims (.select.eq)
function mockDb(provCount: number, claimCount: number) {
  const prov = { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: provCount }) }) }) }
  const claim = { select: () => ({ eq: () => Promise.resolve({ count: claimCount }) }) }
  return { from: (t: string) => (t === 'partner_provisionen' ? prov : claim) } as never
}

describe('hatErstenFall', () => {
  it('true bei vermittelter Provision', async () => {
    expect(await hatErstenFall(mockDb(1, 0), 'w')).toBe(true)
  })
  it('true bei reparatur_werkstatt_id', async () => {
    expect(await hatErstenFall(mockDb(0, 1), 'w')).toBe(true)
  })
  it('false ohne beides', async () => {
    expect(await hatErstenFall(mockDb(0, 0), 'w')).toBe(false)
  })
})
