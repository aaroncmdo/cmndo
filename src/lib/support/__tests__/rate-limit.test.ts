// AAR-518: Unit-Tests für checkRateLimit / incrementRateLimit.
// Supabase-Admin-Client wird gemockt, sodass wir das Bucket-Verhalten ohne
// echte DB durchspielen können.

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Row = { user_id: string; hour_bucket: string; count: number }

const state: { rows: Row[] } = { rows: [] }

function mockQuery(selectResult?: { data: Partial<Row> | null; error: null | { message: string } }) {
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    maybeSingle: vi.fn(async () => selectResult ?? { data: null, error: null }),
    insert: vi.fn(async (row: Row) => {
      state.rows.push(row)
      return { error: null }
    }),
    update: vi.fn((patch: Partial<Row>) => {
      const upd = {
        eq: vi.fn(() => upd),
      } as { eq: ReturnType<typeof vi.fn> } & Promise<{ error: null }>
      // Finde aktuelle Row (es gibt nur eine)
      const target = state.rows[state.rows.length - 1]
      if (target) Object.assign(target, patch)
      // upd soll awaitable sein
      return Object.assign(upd, Promise.resolve({ error: null }))
    }),
  }
  return queryBuilder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => {
      const last = state.rows[state.rows.length - 1] ?? null
      return mockQuery(last ? { data: { count: last.count }, error: null } : { data: null, error: null })
    },
  }),
}))

describe('checkRateLimit / incrementRateLimit', () => {
  beforeEach(() => {
    state.rows = []
  })

  it('lässt den ersten Request durch (used=0, remaining=10)', async () => {
    const { checkRateLimit, SUPPORT_RATE_LIMIT_PER_HOUR } = await import('../rate-limit')
    const result = await checkRateLimit('user-1')
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(0)
    expect(result.remaining).toBe(SUPPORT_RATE_LIMIT_PER_HOUR)
    expect(result.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('erhöht den Counter beim Increment', async () => {
    const { incrementRateLimit, checkRateLimit } = await import('../rate-limit')
    await incrementRateLimit('user-2')
    expect(state.rows.length).toBe(1)
    expect(state.rows[0].count).toBe(1)
    const after = await checkRateLimit('user-2')
    expect(after.used).toBe(1)
    expect(after.remaining).toBe(9)
  })

  it('blockt ab 10 genutzten Requests pro Stunde', async () => {
    const { checkRateLimit } = await import('../rate-limit')
    state.rows = [
      { user_id: 'user-3', hour_bucket: new Date().toISOString(), count: 10 },
    ]
    const result = await checkRateLimit('user-3')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('liefert resetAt genau eine Stunde nach dem aktuellen Bucket', async () => {
    const { checkRateLimit } = await import('../rate-limit')
    const now = new Date()
    const result = await checkRateLimit('user-4')
    const reset = new Date(result.resetAt)
    const bucket = new Date(now)
    bucket.setUTCMinutes(0, 0, 0)
    bucket.setUTCHours(bucket.getUTCHours() + 1)
    expect(reset.toISOString()).toBe(bucket.toISOString())
  })
})
