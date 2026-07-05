import { describe, it, expect, vi } from 'vitest'
import { auszahlenProvision, freigebenProvision, storniereProvision } from './provision-status'
function fakeDb(row: Record<string, unknown>) {
  const upd = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  return {
    _upd: upd,
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (patch: unknown) => { upd(patch); return { eq: () => Promise.resolve({ error: null }) } },
    }),
  } as any
}
describe('auszahlenProvision', () => {
  it('blockt bei unbekanntem USt-Status', async () => {
    const db = fakeDb({ betrag_netto_eur: 100, makler: { ist_kleinunternehmer: null } })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/USt-Status/)
  })
  it('friert USt ein (regelbesteuert)', async () => {
    const db = fakeDb({ betrag_netto_eur: 100, makler: { ist_kleinunternehmer: false } })
    const r = await auszahlenProvision(db, 'makler_provisionen', 'x')
    expect(r.ok).toBe(true)
    expect(db._upd).toHaveBeenCalledWith(expect.objectContaining({ ust_satz: 19, ust_betrag: 19, betrag_brutto: 119 }))
  })
})

describe('storniereProvision', () => {
  it('(a) makler_staffel_bonus schreibt NUR status:storniert — kein storniert_am', async () => {
    const db = fakeDb({})
    const r = await storniereProvision(db, 'makler_staffel_bonus', 'x', 'Testgrund')
    expect(r.ok).toBe(true)
    const patch = db._upd.mock.calls[0][0] as Record<string, unknown>
    expect(patch.status).toBe('storniert')
    expect(patch.storniert_am).toBeUndefined()
    expect(patch.storno_grund).toBeUndefined()
  })

  it('(b) freigebenProvision fuer provisionen_maik schreibt status:confirmed', async () => {
    const db = fakeDb({})
    const r = await freigebenProvision(db, 'provisionen_maik', 'x')
    expect(r.ok).toBe(true)
    expect(db._upd).toHaveBeenCalledWith({ status: 'confirmed' })
  })

  it('(c) storniereProvision fuer provisionen_maik schreibt status:reversed + reversed_grund (kein storniert_am)', async () => {
    const db = fakeDb({})
    const r = await storniereProvision(db, 'provisionen_maik', 'x', 'Rueckbuchung')
    expect(r.ok).toBe(true)
    const patch = db._upd.mock.calls[0][0] as Record<string, unknown>
    expect(patch.status).toBe('reversed')
    expect(patch.reversed_grund).toBe('Rueckbuchung')
    expect(patch.storniert_am).toBeUndefined()
  })
})
