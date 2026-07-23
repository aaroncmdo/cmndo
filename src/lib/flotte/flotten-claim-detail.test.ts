import { describe, it, expect, vi } from 'vitest'
import { getFlottenClaimView } from './flotten-claim-detail'

function makeDb(opts: {
  ownership: boolean
  claim: Record<string, unknown> | null
  vehicle?: Record<string, unknown> | null
  fallId?: string | null
  verursacher?: Record<string, unknown> | null
  person?: Record<string, unknown> | null
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
      if (table === 'faelle_claim_bridge') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { fall_id: opts.fallId ?? null }, error: null }),
            }),
          }),
        }
      }
      if (table === 'claim_parties') {
        // .select().eq('claim_id').eq('rolle').maybeSingle() -> zwei eq
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.verursacher ?? null, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'personen') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.person ?? null, error: null }),
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

const LEER_UNFALL = {
  gegnerName: null,
  gegnerKennzeichen: null,
  gegnerVersicherung: null,
  hergang: null,
  unfallort: null,
}

describe('getFlottenClaimView', () => {
  it('gibt null wenn das Fahrzeug nicht zur Firma gehoert (Ownership-Gate)', async () => {
    const db = makeDb({ ownership: false, claim: { id: 'c1', vehicle_id: 'v1' } })
    expect(await getFlottenClaimView(db, 'firma1', 'v1', 'c1')).toBeNull()
  })

  it('gibt null wenn der Claim zu einem ANDEREN Fahrzeug gehoert (kein Cross-Fahrzeug-Leak)', async () => {
    const db = makeDb({ ownership: true, claim: { id: 'c1', vehicle_id: 'anderes-fahrzeug' } })
    expect(await getFlottenClaimView(db, 'firma1', 'v1', 'c1')).toBeNull()
  })

  it('gibt null wenn der Claim nicht existiert', async () => {
    const db = makeDb({ ownership: true, claim: null })
    expect(await getFlottenClaimView(db, 'firma1', 'v1', 'c1')).toBeNull()
  })

  it('mappt das Claim-View auf dem Happy-Path (ohne SV/KB, ohne fall_id, ohne Gegner)', async () => {
    const db = makeDb({
      ownership: true,
      claim: {
        id: 'c1',
        claim_nummer: 'CL-100',
        operative_status: 'in_bearbeitung',
        schadentag: '2026-07-01',
        schadens_hoehe_netto: 1234.5,
        vehicle_id: 'v1',
        sv_id: null,
        kundenbetreuer_id: null,
        hergang_kunde_text: null,
        schadenort_adresse: null,
        schadenort_ort: null,
      },
      vehicle: { kennzeichen_aktuell: 'B-FL 202', hersteller: 'BMW', modell_haupttyp: '320d' },
      fallId: null,
    })
    const res = await getFlottenClaimView(db, 'firma1', 'v1', 'c1')
    expect(res).toEqual({
      claimId: 'c1',
      fallId: null,
      claimNummer: 'CL-100',
      status: 'in_bearbeitung',
      schadentag: '2026-07-01',
      schadensHoeheNetto: 1234.5,
      kennzeichen: 'B-FL 202',
      hersteller: 'BMW',
      modell: '320d',
      sv: null,
      kb: null,
      unfalldaten: LEER_UNFALL,
      dokumente: [],
    })
  })

  it('mappt Unfalldaten: Gegner (Name via personen) + Hergang + Unfallort', async () => {
    const db = makeDb({
      ownership: true,
      claim: {
        id: 'c1',
        claim_nummer: 'CL-101',
        operative_status: 'ersterfassung',
        schadentag: '2026-07-02',
        schadens_hoehe_netto: null,
        vehicle_id: 'v1',
        sv_id: null,
        kundenbetreuer_id: null,
        hergang_kunde_text: 'Auffahrunfall an der Ampel.',
        schadenort_adresse: 'Hauptstr. 1',
        schadenort_ort: 'Köln',
      },
      vehicle: { kennzeichen_aktuell: 'B-FL 202', hersteller: 'BMW', modell_haupttyp: '320d' },
      fallId: null,
      verursacher: { kennzeichen: 'K AB 2026', versicherung_klartext: 'HUK', person_id: 'p1' },
      person: { vorname: null, nachname: 'Nicolas Kitta' },
    })
    const res = await getFlottenClaimView(db, 'firma1', 'v1', 'c1')
    expect(res?.unfalldaten).toEqual({
      gegnerName: 'Nicolas Kitta',
      gegnerKennzeichen: 'K AB 2026',
      gegnerVersicherung: 'HUK',
      hergang: 'Auffahrunfall an der Ampel.',
      unfallort: 'Hauptstr. 1, Köln',
    })
  })
})
