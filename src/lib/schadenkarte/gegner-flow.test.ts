import { describe, it, expect, vi } from 'vitest'

// Mock resolveSchadenkarteToFahrzeug so tests don't hit the DB chain
vi.mock('./schadenkarte', () => ({
  resolveSchadenkarteToFahrzeug: vi.fn(),
}))

import { resolveSchadenTokenContext } from './gegner-flow'
import { resolveSchadenkarteToFahrzeug } from './schadenkarte'

const mockResolve = vi.mocked(resolveSchadenkarteToFahrzeug)

// ---------------------------------------------------------------------------
// Helper: build a minimal db mock for vehicle + firma lookups
// ---------------------------------------------------------------------------

function makeDb(opts: {
  vehicle: Record<string, unknown> | null
  firma: Record<string, unknown> | null
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'vehicles') return { data: opts.vehicle }
            if (table === 'firmen') return { data: opts.firma }
            return { data: null }
          },
        }),
      }),
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSchadenTokenContext', () => {
  it('returns nicht_gefunden when token is unknown (resolve returns null)', async () => {
    mockResolve.mockResolvedValueOnce(null)
    const db = makeDb({ vehicle: null, firma: null })
    const res = await resolveSchadenTokenContext(db, 'SKT-UNKNOWN000000')
    expect(res).toEqual({ ok: false, reason: 'nicht_gefunden' })
  })

  it('returns nicht_gebunden when card status is "frei"', async () => {
    mockResolve.mockResolvedValueOnce({ fahrzeugId: 'v1', firmaId: 'f1', status: 'frei' })
    const db = makeDb({ vehicle: null, firma: null })
    const res = await resolveSchadenTokenContext(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({ ok: false, reason: 'nicht_gebunden' })
  })

  it('returns nicht_gebunden when card status is "bestellt"', async () => {
    mockResolve.mockResolvedValueOnce({ fahrzeugId: null, firmaId: 'f1', status: 'bestellt' })
    const db = makeDb({ vehicle: null, firma: null })
    const res = await resolveSchadenTokenContext(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({ ok: false, reason: 'nicht_gebunden' })
  })

  it('returns kein_fahrzeug when bound but fahrzeugId is null', async () => {
    mockResolve.mockResolvedValueOnce({ fahrzeugId: null, firmaId: 'f1', status: 'gebunden' })
    const db = makeDb({ vehicle: null, firma: null })
    const res = await resolveSchadenTokenContext(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({ ok: false, reason: 'kein_fahrzeug' })
  })

  it('returns kein_fahrzeug when bound but firmaId is null', async () => {
    mockResolve.mockResolvedValueOnce({ fahrzeugId: 'v1', firmaId: null, status: 'gebunden' })
    const db = makeDb({ vehicle: null, firma: null })
    const res = await resolveSchadenTokenContext(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({ ok: false, reason: 'kein_fahrzeug' })
  })

  it('returns ok:true with full context for a bound card with vehicle + firma', async () => {
    mockResolve.mockResolvedValueOnce({ fahrzeugId: 'v1', firmaId: 'f1', status: 'gebunden' })
    const db = makeDb({
      vehicle: { kennzeichen_aktuell: 'M-AB 1234', hersteller: 'BMW', modell_haupttyp: '3er' },
      firma: { name: 'Musterfirma GmbH' },
    })
    const res = await resolveSchadenTokenContext(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({
      ok: true,
      context: {
        fahrzeugId: 'v1',
        firmaId: 'f1',
        kennzeichen: 'M-AB 1234',
        hersteller: 'BMW',
        modell: '3er',
        firmaName: 'Musterfirma GmbH',
      },
    })
  })

  it('returns ok:true with nulled fields when vehicle/firma rows have null columns', async () => {
    mockResolve.mockResolvedValueOnce({ fahrzeugId: 'v2', firmaId: 'f2', status: 'gebunden' })
    const db = makeDb({
      vehicle: { kennzeichen_aktuell: null, hersteller: null, modell_haupttyp: null },
      firma: { name: null },
    })
    const res = await resolveSchadenTokenContext(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({
      ok: true,
      context: {
        fahrzeugId: 'v2',
        firmaId: 'f2',
        kennzeichen: null,
        hersteller: null,
        modell: null,
        firmaName: null,
      },
    })
  })

  it('returns ok:true with nulled fields when vehicle/firma rows are not found in DB', async () => {
    mockResolve.mockResolvedValueOnce({ fahrzeugId: 'v3', firmaId: 'f3', status: 'gebunden' })
    const db = makeDb({ vehicle: null, firma: null })
    const res = await resolveSchadenTokenContext(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({
      ok: true,
      context: {
        fahrzeugId: 'v3',
        firmaId: 'f3',
        kennzeichen: null,
        hersteller: null,
        modell: null,
        firmaName: null,
      },
    })
  })
})
