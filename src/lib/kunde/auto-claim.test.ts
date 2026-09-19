import { describe, it, expect, vi, beforeEach } from 'vitest'

const finde = vi.fn()
vi.mock('@/lib/auth/lead-kontakt', () => ({ findeVorgaengeZuKontakt: (...a: unknown[]) => finde(...a) }))

import { claimFaelleByKontakt, claimFaelleByEmail } from './auto-claim'

type Call = { table: string; payload: unknown }
function adminMock(updatedIds: string[]) {
  const calls: Call[] = []
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    q.update = vi.fn((p: unknown) => { calls.push({ table, payload: p }); return q })
    for (const m of ['in', 'is', 'eq']) q[m] = vi.fn(() => q)
    q.select = vi.fn(() => Promise.resolve({ data: updatedIds.map((id) => ({ id })), error: null }))
    ;(q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: null, error: null })
    return q
  }
  const admin = { from: vi.fn((t: string) => chain(t)), calls }
  return admin as unknown as import('@supabase/supabase-js').SupabaseClient & { calls: Call[] }
}

beforeEach(() => finde.mockReset())

describe('claimFaelleByKontakt', () => {
  it('0 ohne Kontakt, ohne Suche', async () => {
    const admin = adminMock([])
    expect(await claimFaelleByKontakt(admin, 'U1', { email: null, telefon: null })).toEqual({ claimed: 0 })
    expect(finde).not.toHaveBeenCalled()
  })
  it('setzt geschaedigter_user_id auf allen Claims des Kontakts (Telefon-Weg)', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: ['C1', 'C2'], leadEmail: null, leadVorname: null })
    const admin = adminMock(['C1', 'C2'])
    const r = await claimFaelleByKontakt(admin, 'U1', { email: null, telefon: '+491775799941' })
    expect(r).toEqual({ claimed: 2 })
    expect(finde).toHaveBeenCalledWith(admin, { email: null, telefon: '+491775799941' })
    expect(admin.calls[0]).toEqual({ table: 'claims', payload: { geschaedigter_user_id: 'U1' } })
    expect(admin.calls[1]).toEqual({ table: 'claim_parties', payload: { user_id: 'U1' } })
  })
  it('0 wenn der Kontakt bekannt ist, aber keinen Claim hat (nur Lead)', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: null, leadVorname: null })
    const admin = adminMock([])
    expect(await claimFaelleByKontakt(admin, 'U1', { email: 'k@example.test', telefon: null })).toEqual({ claimed: 0 })
    expect(admin.calls).toEqual([])
  })
  it('claimFaelleByEmail bleibt ein Wrapper (E-Mail-only)', async () => {
    finde.mockResolvedValue({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    const admin = adminMock([])
    await claimFaelleByEmail(admin, 'U1', 'k@example.test')
    expect(finde).toHaveBeenCalledWith(admin, { email: 'k@example.test', telefon: null })
  })
})
