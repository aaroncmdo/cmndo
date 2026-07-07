import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

import { resolvePromoCodeToId } from './resolve-promo-code'

beforeEach(() => { maybeSingle.mockReset() })

describe('resolvePromoCodeToId', () => {
  it('gibt null fuer leer/null/ungueltig zurueck ohne DB-Call', async () => {
    expect(await resolvePromoCodeToId(null)).toBeNull()
    expect(await resolvePromoCodeToId(undefined)).toBeNull()
    expect(await resolvePromoCodeToId('')).toBeNull()
    expect(await resolvePromoCodeToId('NICHT-MK')).toBeNull()
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('loest einen aktiven Code zur id auf (case-insensitive, getrimmt)', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'pc-1', aktiv: true } })
    expect(await resolvePromoCodeToId('  mk-abcd  ')).toBe('pc-1')
  })

  it('gibt null fuer einen inaktiven Code', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'pc-2', aktiv: false } })
    expect(await resolvePromoCodeToId('MK-DEAD')).toBeNull()
  })

  it('gibt null fuer einen unbekannten Code', async () => {
    maybeSingle.mockResolvedValue({ data: null })
    expect(await resolvePromoCodeToId('MK-XXXX')).toBeNull()
  })
})
