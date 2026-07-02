import { describe, it, expect, vi, beforeEach } from 'vitest'

// Gutachter-Onboarding-Audit (Befund #6, Admin-Toggle): setzeSvTestaccount setzt
// das ist_testaccount-Flag (aus dem Karte/Dispatch/MCP/LP-Filter). Admin-gated;
// Schreibt via createAdminClient (untyped — ist_testaccount ist neu, noch nicht in
// database.types).

let state: { user: { id: string } | null; rolle: string }
const updateCapture = { vals: null as Record<string, unknown> | null, table: null as string | null }
const adminUpdateEq = vi.fn(async () => ({ error: null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: state.rolle } }) }) }),
    }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (vals: Record<string, unknown>) => {
        updateCapture.table = table
        updateCapture.vals = vals
        return { eq: adminUpdateEq }
      },
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setzeSvTestaccount } from '../test-account-actions'

beforeEach(() => {
  state = { user: { id: 'admin-1' }, rolle: 'admin' }
  updateCapture.vals = null
  updateCapture.table = null
  adminUpdateEq.mockClear()
})

describe('setzeSvTestaccount', () => {
  it('Nicht-Admin wird abgelehnt — kein Update', async () => {
    state.rolle = 'sachverstaendiger'
    const res = await setzeSvTestaccount('sv-1', true)
    expect(res.success).toBe(false)
    expect(updateCapture.vals).toBeNull()
  })

  it('nicht angemeldet -> abgelehnt', async () => {
    state.user = null
    const res = await setzeSvTestaccount('sv-1', true)
    expect(res.success).toBe(false)
    expect(updateCapture.vals).toBeNull()
  })

  it('Admin markiert als Test-Account -> ist_testaccount=true auf sachverstaendige', async () => {
    const res = await setzeSvTestaccount('sv-1', true)
    expect(res.success).toBe(true)
    expect(updateCapture.table).toBe('sachverstaendige')
    expect(updateCapture.vals).toEqual({ ist_testaccount: true })
  })

  it('Admin hebt Test-Markierung auf -> ist_testaccount=false', async () => {
    const res = await setzeSvTestaccount('sv-1', false)
    expect(res.success).toBe(true)
    expect(updateCapture.vals).toEqual({ ist_testaccount: false })
  })
})
