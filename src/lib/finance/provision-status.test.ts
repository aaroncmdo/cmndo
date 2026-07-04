import { describe, it, expect, vi } from 'vitest'
import { auszahlenProvision } from './provision-status'
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
