import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
  }),
}))

import { getMaklerEmpfehlung } from './makler-empfehlung'

beforeEach(() => { maybeSingle.mockReset() })

describe('getMaklerEmpfehlung', () => {
  it('gibt null fuer leer/null/ungueltig zurueck ohne DB-Call', async () => {
    expect(await getMaklerEmpfehlung(null)).toBeNull()
    expect(await getMaklerEmpfehlung(undefined)).toBeNull()
    expect(await getMaklerEmpfehlung('NICHT-MK')).toBeNull()
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('liefert firma fuer aktiven Makler (nested-FK als Objekt)', async () => {
    maybeSingle.mockResolvedValue({ data: { makler: { firma: 'Muster GmbH', status: 'aktiv' } } })
    expect(await getMaklerEmpfehlung('mk-abcd')).toEqual({ firma: 'Muster GmbH' })
  })

  it('liefert firma auch wenn nested-FK als Array kommt', async () => {
    maybeSingle.mockResolvedValue({ data: { makler: [{ firma: 'Arr GmbH', status: 'aktiv' }] } })
    expect(await getMaklerEmpfehlung('MK-ABCD')).toEqual({ firma: 'Arr GmbH' })
  })

  it('gibt null bei inaktivem Makler-Status', async () => {
    maybeSingle.mockResolvedValue({ data: { makler: { firma: 'X GmbH', status: 'inaktiv' } } })
    expect(await getMaklerEmpfehlung('MK-DEAD')).toBeNull()
  })

  it('gibt null bei unbekanntem Code', async () => {
    maybeSingle.mockResolvedValue({ data: null })
    expect(await getMaklerEmpfehlung('MK-XXXX')).toBeNull()
  })
})
