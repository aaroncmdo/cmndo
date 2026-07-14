import { describe, it, expect, vi, beforeEach } from 'vitest'

const tasks: Array<Record<string, unknown>> = []
const state = {
  authed: true,
  invites: [] as Array<{ id: string; claim_id: string }>,
  updated: [] as string[],
  queryError: null as { message: string } | null,
}

vi.mock('@/lib/auth/cron-auth', () => ({ assertCronAuth: () => state.authed }))

vi.mock('@/lib/vs-meldung/dispatch-task', () => ({
  erstelleVsDispatchTask: async (i: Record<string, unknown>) => {
    tasks.push(i)
    return { ok: true }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.in = () => b
      b.is = () => b
      b.lt = async () => ({ data: state.invites, error: state.queryError })
      b.update = () => b
      b.eq = async (_c: string, v: string) => {
        state.updated.push(v)
        return { error: null }
      }
      return b
    },
  }),
}))

beforeEach(() => {
  tasks.length = 0
  state.authed = true
  state.invites = []
  state.updated = []
  state.queryError = null
})

describe('GET /api/cron/gegner-invite-nachfassen', () => {
  it('ohne CRON_SECRET: 401, keine Nebenwirkung', async () => {
    state.authed = false
    const { GET } = await import('../route')
    const res = await GET(new Request('http://x'))

    expect(res.status).toBe(401)
    expect(tasks).toHaveLength(0)
  })

  it('unbestaetigte Invites aelter als 48h -> ein Dispatch-Task je Claim', async () => {
    state.invites = [
      { id: 'i1', claim_id: 'c1' },
      { id: 'i2', claim_id: 'c2' },
    ]
    const { GET } = await import('../route')
    const res = await GET(new Request('http://x'))

    expect(res.status).toBe(200)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({ claimId: 'c1', grund: 'nicht_bestaetigt' })
    expect(tasks[1]).toMatchObject({ claimId: 'c2', grund: 'nicht_bestaetigt' })
    // als abgelaufen markiert -> der naechste Lauf greift sie nicht erneut auf
    expect(state.updated).toEqual(['i1', 'i2'])
  })

  it('nichts zu tun -> 200 mit 0', async () => {
    const { GET } = await import('../route')
    const res = await GET(new Request('http://x'))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ geprueft: 0, eskaliert: 0 })
  })

  it('DB-Fehler -> 500, keine Tasks', async () => {
    state.queryError = { message: 'boom' }
    const { GET } = await import('../route')
    const res = await GET(new Request('http://x'))

    expect(res.status).toBe(500)
    expect(tasks).toHaveLength(0)
  })
})
