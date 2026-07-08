import { describe, it, expect, vi, beforeEach } from 'vitest'

const { role } = vi.hoisted(() => ({ role: { ok: true as boolean } }))
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async () =>
    role.ok ? { success: true, user: { id: 'u' } } : { success: false, error: 'nope', user: null },
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/vertrieb/get-vertrieb-kontakte', () => ({
  getVertriebKontakte: async () => ({ ok: true, data: [{ id: 'a', kind: 'sv', stufe: 'aktiv' }] }),
}))
vi.mock('@/lib/vertrieb/get-vertrieb-rollup', () => ({
  getVertriebRollup: async () => ({ ok: true, data: [{ kind: 'sv', stufe: 'aktiv', anzahl: 1 }] }),
}))

import { getVertriebDaten } from './get-vertrieb-daten'

beforeEach(() => {
  role.ok = true
})

describe('getVertriebDaten', () => {
  it('non-staff -> ok:false (Guard vor Admin-Client)', async () => {
    role.ok = false
    const r = await getVertriebDaten()
    expect(r.ok).toBe(false)
  })
  it('staff -> kontakte + rollup', async () => {
    const r = await getVertriebDaten()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.kontakte).toHaveLength(1)
      expect(r.rollup).toHaveLength(1)
    }
  })
})
