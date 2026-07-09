import { describe, it, expect, vi, beforeEach } from 'vitest'

// Zwei Tabellen im selben Admin-Client: promotion_codes (Firma-Aufloesung) + partner_rang
// (verdienter Tier via getPartnerRang). Beide nutzen die Kette select->eq->eq->maybeSingle;
// wir routen maybeSingle nach Tabellenname.
const promoMaybeSingle = vi.fn()
const rangMaybeSingle = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: table === 'partner_rang' ? rangMaybeSingle : promoMaybeSingle,
          }),
        }),
      }),
    }),
  }),
}))

import { getMaklerEmpfehlung } from './makler-empfehlung'

beforeEach(() => {
  promoMaybeSingle.mockReset()
  rangMaybeSingle.mockReset()
  rangMaybeSingle.mockResolvedValue({ data: null }) // Default: kein Rang -> tier null
})

describe('getMaklerEmpfehlung', () => {
  it('gibt null fuer leer/null/ungueltig zurueck ohne DB-Call', async () => {
    expect(await getMaklerEmpfehlung(null)).toBeNull()
    expect(await getMaklerEmpfehlung(undefined)).toBeNull()
    expect(await getMaklerEmpfehlung('NICHT-MK')).toBeNull()
    expect(promoMaybeSingle).not.toHaveBeenCalled()
  })

  it('liefert firma + tier=null fuer aktiven Makler ohne Rang (nested-FK als Objekt)', async () => {
    promoMaybeSingle.mockResolvedValue({ data: { makler_id: 'mk-1', makler: { firma: 'Muster GmbH', status: 'aktiv' } } })
    expect(await getMaklerEmpfehlung('mk-abcd')).toEqual({ firma: 'Muster GmbH', tier: null })
  })

  it('liefert firma auch wenn nested-FK als Array kommt', async () => {
    promoMaybeSingle.mockResolvedValue({ data: { makler_id: 'mk-2', makler: [{ firma: 'Arr GmbH', status: 'aktiv' }] } })
    expect(await getMaklerEmpfehlung('MK-ABCD')).toEqual({ firma: 'Arr GmbH', tier: null })
  })

  it('haengt den verdienten Tier an, wenn der Makler einen gate-konformen Rang hat', async () => {
    promoMaybeSingle.mockResolvedValue({ data: { makler_id: 'mk-3', makler: { firma: 'Gold GmbH', status: 'aktiv' } } })
    rangMaybeSingle.mockResolvedValue({ data: { rang: 'gold', sinnsatz: 'Gold-Partner · erfahrener Partner · verifiziert', volumen: 20, stand: '2026-07-08T00:00:00Z' } })
    expect(await getMaklerEmpfehlung('MK-GOLD')).toEqual({ firma: 'Gold GmbH', tier: 'gold' })
  })

  it('gibt null bei inaktivem Makler-Status (ohne Rang-Lookup)', async () => {
    promoMaybeSingle.mockResolvedValue({ data: { makler_id: 'mk-4', makler: { firma: 'X GmbH', status: 'inaktiv' } } })
    expect(await getMaklerEmpfehlung('MK-DEAD')).toBeNull()
    expect(rangMaybeSingle).not.toHaveBeenCalled()
  })

  it('gibt null bei unbekanntem Code', async () => {
    promoMaybeSingle.mockResolvedValue({ data: null })
    expect(await getMaklerEmpfehlung('MK-XXXX')).toBeNull()
  })
})
