import { describe, it, expect, vi } from 'vitest'
import { getFlottenClaimDetail } from './flotten-claim-detail'

function makeDb(opts: {
  ownership: boolean
  claim: Record<string, unknown> | null
  vehicle?: Record<string, unknown> | null
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'flotten_fahrzeuge') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.ownership ? { id: 'ff1' } : null, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'claims') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.claim, error: null }),
            }),
          }),
        }
      }
      // vehicles
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.vehicle ?? null, error: null }),
          }),
        }),
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('getFlottenClaimDetail', () => {
  it('gibt null wenn das Fahrzeug nicht zur Firma gehoert (Ownership-Gate)', async () => {
    const db = makeDb({ ownership: false, claim: { id: 'c1', vehicle_id: 'v1' } })
    expect(await getFlottenClaimDetail(db, 'firma1', 'v1', 'c1')).toBeNull()
  })

  it('gibt null wenn der Claim zu einem ANDEREN Fahrzeug gehoert (kein Cross-Fahrzeug-Leak)', async () => {
    const db = makeDb({ ownership: true, claim: { id: 'c1', vehicle_id: 'anderes-fahrzeug' } })
    expect(await getFlottenClaimDetail(db, 'firma1', 'v1', 'c1')).toBeNull()
  })

  it('gibt null wenn der Claim nicht existiert', async () => {
    const db = makeDb({ ownership: true, claim: null })
    expect(await getFlottenClaimDetail(db, 'firma1', 'v1', 'c1')).toBeNull()
  })

  it('mappt das Claim-Detail auf dem Happy-Path', async () => {
    const db = makeDb({
      ownership: true,
      claim: {
        id: 'c1',
        claim_nummer: 'CL-100',
        status: 'in_bearbeitung',
        schadentag: '2026-07-01',
        schadens_hoehe_netto: 1234.5,
        vehicle_id: 'v1',
      },
      vehicle: { kennzeichen_aktuell: 'B-FL 202', hersteller: 'BMW', modell_haupttyp: '320d' },
    })
    const res = await getFlottenClaimDetail(db, 'firma1', 'v1', 'c1')
    expect(res).toEqual({
      claimId: 'c1',
      claimNummer: 'CL-100',
      status: 'in_bearbeitung',
      schadentag: '2026-07-01',
      schadensHoeheNetto: 1234.5,
      kennzeichen: 'B-FL 202',
      hersteller: 'BMW',
      modell: '320d',
    })
  })
})
