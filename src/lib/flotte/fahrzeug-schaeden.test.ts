import { describe, it, expect, vi } from 'vitest'
import { getFahrzeugSchaeden } from './fahrzeug-schaeden'

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

/** Builds a minimal fake db where flotten_fahrzeuge lookup returns null (no ownership). */
function makeDbNoOwnership() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          in: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [], error: null })),
          })),
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

/** Builds a fake db where ownership is confirmed and claims/leads return given data. */
function makeDbWithData(params: {
  claimsData: unknown[]
  claimsError?: { message: string } | null
  leadsData: unknown[]
  leadsError?: { message: string } | null
}) {
  let callIndex = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: vi.fn((table: string) => {
      if (table === 'flotten_fahrzeuge') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'ff1' }, error: null })),
              })),
            })),
          })),
        }
      }
      if (table === 'claims') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: params.claimsData,
                error: params.claimsError ?? null,
              })),
            })),
          })),
        }
      }
      if (table === 'leads') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn((col: string, vals: unknown[]) => {
                callIndex++
                // Expose captured in-filter values for assertion in test (c)
                ;(makeDbWithData as unknown as Record<string, unknown>)['_lastInArgs_' + callIndex] = { col, vals }
                return {
                  order: vi.fn(async () => ({
                    data: params.leadsData,
                    error: params.leadsError ?? null,
                  })),
                }
              }),
            })),
          })),
        }
      }
      return { select: vi.fn(() => ({})) }
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

/** Builds a db that captures the `.in(...)` arguments for assertion. */
function makeDbCapturingIn(params: {
  claimsData: unknown[]
  leadsData: unknown[]
}) {
  let capturedInArgs: { col: string; vals: unknown[] } | null = null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = {
    from: vi.fn((table: string) => {
      if (table === 'flotten_fahrzeuge') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'ff1' }, error: null })),
              })),
            })),
          })),
        }
      }
      if (table === 'claims') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: params.claimsData, error: null })),
            })),
          })),
        }
      }
      if (table === 'leads') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn((col: string, vals: unknown[]) => {
                capturedInArgs = { col, vals }
                return {
                  order: vi.fn(async () => ({ data: params.leadsData, error: null })),
                }
              }),
            })),
          })),
        }
      }
      return { select: vi.fn(() => ({})) }
    }),
    _getCapturedInArgs: () => capturedInArgs,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  return db
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getFahrzeugSchaeden', () => {
  // (a) vehicle NOT in firma -> early return, claims/leads never queried
  it('(a) returns empty result when vehicle is not in firma — claims/leads queries are skipped', async () => {
    const db = makeDbNoOwnership()
    const result = await getFahrzeugSchaeden(db, 'firma-x', 'vehicle-y')

    expect(result).toEqual({ claims: [], drafts: [] })

    // The only table that should have been queried is flotten_fahrzeuge
    // claims and leads must never be called
    const calls: string[] = db.from.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(calls).not.toContain('claims')
    expect(calls).not.toContain('leads')
  })

  // (b) vehicle in firma -> claims mapped correctly with field renames, sorted desc
  it('(b) maps claims to ClaimMini with correct field renames when vehicle belongs to firma', async () => {
    const rawClaims = [
      {
        id: 'c2',
        claim_nummer: 'CLM-002',
        status: 'abgeschlossen',
        schadentag: '2026-06-01',
        schadens_hoehe_netto: 4200.5,
        created_at: '2026-06-15T10:00:00Z',
      },
      {
        id: 'c1',
        claim_nummer: 'CLM-001',
        status: 'in-bearbeitung',
        schadentag: '2026-03-01',
        schadens_hoehe_netto: 1500.0,
        created_at: '2026-03-20T08:00:00Z',
      },
    ]

    const db = makeDbWithData({ claimsData: rawClaims, leadsData: [] })
    const result = await getFahrzeugSchaeden(db, 'firma-a', 'vehicle-b')

    expect(result.claims).toHaveLength(2)
    expect(result.claims[0]).toEqual({
      claimId: 'c2',
      claimNummer: 'CLM-002',
      status: 'abgeschlossen',
      schadentag: '2026-06-01',
      schadensHoeheNetto: 4200.5,
      createdAt: '2026-06-15T10:00:00Z',
    })
    expect(result.claims[1]).toEqual({
      claimId: 'c1',
      claimNummer: 'CLM-001',
      status: 'in-bearbeitung',
      schadentag: '2026-03-01',
      schadensHoeheNetto: 1500.0,
      createdAt: '2026-03-20T08:00:00Z',
    })
  })

  // (c) drafts filter: only the 4 active statuses returned; excluded statuses not queried
  it('(c) applies .in() filter with exactly the 4 draft statuses and maps drafts to DraftMini', async () => {
    const rawLeads = [
      { id: 'l2', status: 'flow-gesendet', created_at: '2026-07-10T09:00:00Z' },
      { id: 'l1', status: 'neu', created_at: '2026-07-01T12:00:00Z' },
    ]

    const db = makeDbCapturingIn({ claimsData: [], leadsData: rawLeads })
    const result = await getFahrzeugSchaeden(db, 'firma-a', 'vehicle-c')

    // Verify the in-filter was called with exactly the 4 expected status values
    const captured = db._getCapturedInArgs()
    expect(captured).not.toBeNull()
    expect(captured.col).toBe('status')
    expect(captured.vals).toEqual(
      expect.arrayContaining(['neu', 'rueckruf', 'quali-offen', 'flow-gesendet']),
    )
    expect(captured.vals).toHaveLength(4)

    // Verify excluded statuses are not in the filter
    for (const excluded of ['umgewandelt', 'umgewandelt-sv', 'disqualifiziert', 'kalt']) {
      expect(captured.vals).not.toContain(excluded)
    }

    // Verify mapped DraftMini shape
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts[0]).toEqual({
      leadId: 'l2',
      status: 'flow-gesendet',
      createdAt: '2026-07-10T09:00:00Z',
    })
    expect(result.drafts[1]).toEqual({
      leadId: 'l1',
      status: 'neu',
      createdAt: '2026-07-01T12:00:00Z',
    })
  })

  // Edge: claims query error -> returns [] for claims, still returns drafts
  it('treats claims query error as empty array (no throw)', async () => {
    const db = makeDbWithData({
      claimsData: [],
      claimsError: { message: 'db error' },
      leadsData: [{ id: 'l1', status: 'neu', created_at: '2026-07-01T00:00:00Z' }],
    })
    const result = await getFahrzeugSchaeden(db, 'firma-a', 'vehicle-e')
    expect(result.claims).toEqual([])
    expect(result.drafts).toHaveLength(1)
  })

  // Edge: nullable fields are preserved as null
  it('preserves null fields (claim_nummer, schadentag, schadens_hoehe_netto)', async () => {
    const rawClaims = [
      {
        id: 'c3',
        claim_nummer: null,
        status: null,
        schadentag: null,
        schadens_hoehe_netto: null,
        created_at: null,
      },
    ]

    const db = makeDbWithData({ claimsData: rawClaims, leadsData: [] })
    const result = await getFahrzeugSchaeden(db, 'firma-a', 'vehicle-f')

    expect(result.claims[0]).toEqual({
      claimId: 'c3',
      claimNummer: null,
      status: null,
      schadentag: null,
      schadensHoeheNetto: null,
      createdAt: null,
    })
  })
})
