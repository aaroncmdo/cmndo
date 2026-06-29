import { describe, it, expect, vi, beforeEach } from 'vitest'

// #updates-rebuild Phase 2: "Alles gesehen" setzt den Read-Marker des Info-Feeds.
const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1' } as { id: string } | null,
    updateErr: null as { message: string } | null,
    updateCalls: [] as Array<Record<string, unknown>>,
  }
  const db = {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      update: (p: Record<string, unknown>) => {
        state.updateCalls.push(p)
        return { eq: async () => ({ error: state.updateErr }) }
      },
    }),
  }
  return { state, db }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.db }))

import { markAllUpdatesSeen } from '../actions'

beforeEach(() => {
  h.state.user = { id: 'u1' }
  h.state.updateErr = null
  h.state.updateCalls.length = 0
})

describe('markAllUpdatesSeen', () => {
  it('setzt updates_last_seen_at fuer den eingeloggten User', async () => {
    const r = await markAllUpdatesSeen()
    expect(r.ok).toBe(true)
    expect(h.state.updateCalls[0]).toHaveProperty('updates_last_seen_at')
  })

  it('ok:false wenn nicht angemeldet (kein throw)', async () => {
    h.state.user = null
    const r = await markAllUpdatesSeen()
    expect(r).toMatchObject({ ok: false })
    expect(h.state.updateCalls).toHaveLength(0)
  })

  it('reicht DB-Fehler als Result durch (kein throw)', async () => {
    h.state.updateErr = { message: 'boom' }
    const r = await markAllUpdatesSeen()
    expect(r).toMatchObject({ ok: false, error: 'boom' })
  })
})
