import { describe, it, expect } from 'vitest'
import { getPartnerRang } from '../get'

describe('getPartnerRang', () => {
  it('null wenn kein Eintrag', async () => {
    const q = {
      select: function () { return this }, eq: function () { return this },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }
    const supabase = { from: () => q } as unknown as Parameters<typeof getPartnerRang>[0]
    expect(await getPartnerRang(supabase, 'sachverstaendiger', 'x')).toBeNull()
  })

  it('mappt Zeile auf PartnerRangRow', async () => {
    const q = {
      select: function () { return this }, eq: function () { return this },
      maybeSingle: () => Promise.resolve({ data: { rang: 'gold', sinnsatz: 'Gold-Partner · verifiziert', volumen: 12, stand: '2026-07-08T00:00:00Z' }, error: null }),
    }
    const supabase = { from: () => q } as unknown as Parameters<typeof getPartnerRang>[0]
    const r = await getPartnerRang(supabase, 'sachverstaendiger', 'x')
    expect(r).toEqual({ tier: 'gold', sinnsatz: 'Gold-Partner · verifiziert', volumen: 12, stand: '2026-07-08T00:00:00Z' })
  })
})
