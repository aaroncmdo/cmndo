import { describe, it, expect, vi } from 'vitest'
import { istIntraNetzwerk } from '../provisions-suppression'

describe('istIntraNetzwerk (pure)', () => {
  const freunde = { svIds: new Set(['sv-freund']), werkstattIds: new Set(['w-freund']) }
  it('zugewiesener SV ist Freund -> intra', () => {
    expect(istIntraNetzwerk({ svId: 'sv-freund', reparaturWerkstattId: null }, freunde)).toBe(true)
  })
  it('zugewiesene Reparatur-Werkstatt ist Freund -> intra', () => {
    expect(istIntraNetzwerk({ svId: null, reparaturWerkstattId: 'w-freund' }, freunde)).toBe(true)
  })
  it('weder SV noch Werkstatt befreundet -> cross-network (nicht intra)', () => {
    expect(istIntraNetzwerk({ svId: 'sv-fremd', reparaturWerkstattId: 'w-fremd' }, freunde)).toBe(false)
  })
  it('beide null -> nicht intra', () => {
    expect(istIntraNetzwerk({ svId: null, reparaturWerkstattId: null }, freunde)).toBe(false)
  })
})

// Batch-Gate mit gemockten P0-/T4a-Abhaengigkeiten.
vi.mock('../freunde', () => ({
  ladeFreundKandidatIds: vi.fn(async (_admin: unknown, owner: string, rolle: string) => {
    if (owner !== 'prof-werkstatt') return new Set<string>()
    return rolle === 'gutachter' ? new Set(['sv-freund']) : new Set(['w-freund'])
  }),
}))
vi.mock('../owner-resolution', async (orig) => ({
  ...((await orig()) as object),
  resolveProvisionPartnerProfil: vi.fn(async (_admin: unknown, typ: string, _id: string) =>
    typ === 'werkstatt' ? 'prof-werkstatt' : null,
  ),
}))

import { bestimmeIntraNetzwerkProvisionen } from '../provisions-suppression'
import { ladeFreundKandidatIds } from '../freunde'
import { resolveProvisionPartnerProfil } from '../owner-resolution'

function fakeAdmin(claims: Record<string, { sv_id: string | null; reparatur_werkstatt_id: string | null }>) {
  const make = () => {
    const c: any = {}
    let ids: string[] = []
    c.select = () => c
    c.in = (_col: string, v: string[]) => { ids = v; return c }
    c.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: ids.filter((id) => claims[id]).map((id) => ({ id, ...claims[id] })), error: null }).then(res)
    return c
  }
  return { from: () => make() } as any
}

describe('bestimmeIntraNetzwerkProvisionen (Batch)', () => {
  it('werkstatt-inbound + befreundeter zugewiesener SV -> unterdrueckt', async () => {
    const admin = fakeAdmin({ c1: { sv_id: 'sv-freund', reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'p1', partner_typ: 'werkstatt', partner_id: 'w1', claim_id: 'c1' },
    ])
    expect(set.has('p1')).toBe(true)
  })
  it('werkstatt-inbound + FREMDER zugewiesener SV -> cross-network (nicht im Set)', async () => {
    const admin = fakeAdmin({ c1: { sv_id: 'sv-fremd', reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'p1', partner_typ: 'werkstatt', partner_id: 'w1', claim_id: 'c1' },
    ])
    expect(set.has('p1')).toBe(false)
  })
  it('makler = extern -> nie im Set (kein Resolve/Graph-Read)', async () => {
    vi.mocked(resolveProvisionPartnerProfil).mockClear()
    vi.mocked(ladeFreundKandidatIds).mockClear()
    const admin = fakeAdmin({ c1: { sv_id: 'sv-freund', reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'pm', partner_typ: 'makler', partner_id: 'm1', claim_id: 'c1' },
      { id: 'pe', partner_typ: 'makler_empfehlung', partner_id: 's1', claim_id: 'c1' },
    ])
    expect(set.size).toBe(0)
    expect(resolveProvisionPartnerProfil).not.toHaveBeenCalled()
    expect(ladeFreundKandidatIds).not.toHaveBeenCalled()
  })
  it('claim_id null -> nicht im Set (kein Anker)', async () => {
    const set = await bestimmeIntraNetzwerkProvisionen(fakeAdmin({}), [
      { id: 'p1', partner_typ: 'werkstatt', partner_id: 'w1', claim_id: null },
    ])
    expect(set.size).toBe(0)
  })
  it('Claim ohne zugewiesenen Gegenpart -> nicht im Set (keine Graph-Reads)', async () => {
    vi.mocked(ladeFreundKandidatIds).mockClear()
    const admin = fakeAdmin({ c1: { sv_id: null, reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'p1', partner_typ: 'werkstatt', partner_id: 'w1', claim_id: 'c1' },
    ])
    expect(set.size).toBe(0)
    expect(ladeFreundKandidatIds).not.toHaveBeenCalled()
  })
  it('unaufloesbarer Partner (resolve -> null) -> nicht im Set (Status quo freigeben)', async () => {
    const admin = fakeAdmin({ c1: { sv_id: 'sv-freund', reparatur_werkstatt_id: null } })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'p1', partner_typ: 'firmen_flotte', partner_id: 'firma-x', claim_id: 'c1' },
    ])
    expect(set.has('p1')).toBe(false)
  })
  it('per-Row-Fehler (resolve wirft) -> Row uebersprungen, Rest normal (wirft nie)', async () => {
    vi.mocked(resolveProvisionPartnerProfil)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('prof-werkstatt')
    const admin = fakeAdmin({
      c1: { sv_id: 'sv-freund', reparatur_werkstatt_id: null },
      c2: { sv_id: 'sv-freund', reparatur_werkstatt_id: null },
    })
    const set = await bestimmeIntraNetzwerkProvisionen(admin, [
      { id: 'p-fehler', partner_typ: 'werkstatt', partner_id: 'w1', claim_id: 'c1' },
      { id: 'p-ok', partner_typ: 'werkstatt', partner_id: 'w2', claim_id: 'c2' },
    ])
    expect(set.has('p-fehler')).toBe(false)
    expect(set.has('p-ok')).toBe(true)
  })
})
