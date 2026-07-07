// src/app/mitarbeiter/claim-edit-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authGetUser = vi.fn()
const fromMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: authGetUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateClaimField, overrideClaimPhase } from './claim-edit-actions'

function claimRow(kb: string | null) {
  return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { kundenbetreuer_id: kb }, error: null }) }) }) }
}
beforeEach(() => { authGetUser.mockReset(); fromMock.mockReset() })

describe('updateClaimField', () => {
  it('lehnt nicht-gewhitelistete Felder ab', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await updateClaimField('c1', 'status', 'reguliert')
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/editierbar/i) })
  })
  it('lehnt ab, wenn User weder Owner noch Admin', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // profiles(role)=kundenbetreuer, claim.kundenbetreuer_id='other'
    fromMock.mockImplementation((t: string) =>
      t === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'kundenbetreuer' }, error: null }) }) }) }
      : t === 'claims' ? claimRow('other') : {})
    const res = await updateClaimField('c1', 'notizen', 'hi')
    expect(res.ok).toBe(false)
  })
  it('schreibt bei Owner + auditet', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const updateEq = vi.fn(async () => ({ error: null }))
    const insert = vi.fn(async () => ({ error: null }))
    fromMock.mockImplementation((t: string) =>
      t === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'kundenbetreuer' }, error: null }) }) }) }
      : t === 'claims' && fromMock.mock.calls.filter(c => c[0]==='claims').length === 1
        ? claimRow('u1')                                   // 1st claims call = ownership read
      : t === 'claims' ? { update: () => ({ eq: updateEq }) } // 2nd claims call = the write
      : t === 'timeline' ? { insert } : {})
    const res = await updateClaimField('c1', 'notizen', 'neue Notiz')
    expect(res).toEqual({ ok: true })
    expect(updateEq).toHaveBeenCalled()
    expect(insert).toHaveBeenCalled()
  })
})

describe('overrideClaimPhase', () => {
  it('lehnt ungueltige Phase ab (enum-sicher)', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await overrideClaimPhase('c1', 'quatsch', 'grund')
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/Phase/i) })
  })
  it('verlangt einen Grund beim Setzen', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await overrideClaimPhase('c1', 'regulierung', '   ')
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/Grund/i) })
  })
  it('setzt Override bei Owner + auditet', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const updateEq = vi.fn(async () => ({ error: null }))
    const insert = vi.fn(async () => ({ error: null }))
    fromMock.mockImplementation((t: string) =>
      t === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle: 'kundenbetreuer' }, error: null }) }) }) }
      : t === 'claims' && fromMock.mock.calls.filter(c => c[0]==='claims').length === 1
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { kundenbetreuer_id: 'u1', phase_override: null }, error: null }) }) }) }
      : t === 'claims' ? { update: () => ({ eq: updateEq }) }
      : t === 'timeline' ? { insert } : {})
    const res = await overrideClaimPhase('c1', 'regulierung', 'Signal war stale')
    expect(res).toEqual({ ok: true })
    expect(updateEq).toHaveBeenCalled()
    expect(insert).toHaveBeenCalled()
  })
})
