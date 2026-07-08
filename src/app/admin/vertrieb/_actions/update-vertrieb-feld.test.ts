import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, updateEq, state } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateEq: vi.fn(() => Promise.resolve({ error: null })),
  state: { rolle: 'admin' as string | null },
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'profiles')
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { rolle: state.rolle } }) }) }) }
      if (table === 'timeline') return { insert: () => Promise.resolve({ error: null }) }
      return { update: () => ({ eq: updateEq }) }
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateVertriebFeld } from './update-vertrieb-feld'

beforeEach(() => {
  updateEq.mockClear()
  state.rolle = 'admin'
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('updateVertriebFeld', () => {
  it('nicht-gewhitelistetes Feld -> ok:false (vor jedem DB-Zugriff)', async () => {
    const res = await updateVertriebFeld('sv', 'x', 'email', 'a@b.de')
    expect(res).toEqual({ ok: false, error: 'Feld nicht editierbar' })
    expect(updateEq).not.toHaveBeenCalled()
  })
  it('nicht angemeldet -> ok:false', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await updateVertriebFeld('sv', 'x', 'notizen', 'hi')
    expect(res.ok).toBe(false)
  })
  it('nicht-Staff-Rolle -> ok:false (kein IDOR)', async () => {
    state.rolle = 'kunde'
    const res = await updateVertriebFeld('sv', 'x', 'notizen', 'hi')
    expect(res).toEqual({ ok: false, error: 'Keine Berechtigung' })
    expect(updateEq).not.toHaveBeenCalled()
  })
  it('Staff + gueltiges Feld -> ok:true + Update aufgerufen', async () => {
    const res = await updateVertriebFeld('sv', 'x', 'notizen', 'hi')
    expect(res).toEqual({ ok: true })
    expect(updateEq).toHaveBeenCalled()
  })
})
