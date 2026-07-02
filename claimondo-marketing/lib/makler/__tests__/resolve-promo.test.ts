import { describe, it, expect } from 'vitest'
import { resolveMaklerByPromoCode } from '../resolve-promo'

// Mock-Supabase: gibt `row` aus promotion_codes.select(...).eq.eq.maybeSingle() zurueck.
function mockSb(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
      }),
    }),
  } as never
}

describe('resolveMaklerByPromoCode', () => {
  it('valider Code -> Objekt', async () => {
    const r = await resolveMaklerByPromoCode(
      mockSb({ id: 'p1', makler: { id: 'm1', firma: 'Muster GmbH', status: 'aktiv' } }),
      'MK-X',
    )
    expect(r).toEqual({ promotionCodeId: 'p1', maklerId: 'm1', firma: 'Muster GmbH', aktiv: true })
  })

  it('unbekannter Code -> null', async () => {
    expect(await resolveMaklerByPromoCode(mockSb(null), 'MK-NOPE')).toBeNull()
  })

  it('inaktiver Makler -> aktiv:false', async () => {
    const r = await resolveMaklerByPromoCode(
      mockSb({ id: 'p1', makler: { id: 'm1', firma: 'X', status: 'gesperrt' } }),
      'MK-X',
    )
    expect(r?.aktiv).toBe(false)
  })

  it('makler als Array (PostgREST-Kardinalitaet) -> normalisiert', async () => {
    const r = await resolveMaklerByPromoCode(
      mockSb({ id: 'p1', makler: [{ id: 'm1', firma: 'Arr GmbH', status: 'aktiv' }] }),
      'MK-X',
    )
    expect(r).toEqual({ promotionCodeId: 'p1', maklerId: 'm1', firma: 'Arr GmbH', aktiv: true })
  })
})
