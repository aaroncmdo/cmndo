import { describe, it, expect, vi } from 'vitest'
import { getKundeFahrzeugSchaeden } from '../fahrzeug-schaeden'

function makeDb(params: {
  owned: boolean
  claimsData?: unknown[]
  leadsData?: unknown[]
  /** IDs, die die v_claim_full-Owner-Query fuer den User liefert. */
  allowedClaimIds?: string[]
  /** IDs, die die leads.kunde_id-Owner-Query fuer den User liefert. */
  allowedLeadIds?: string[]
  /** Simuliert einen Fehler der Claim-Owner-Filter-Query (fail-closed-Test). */
  claimFilterError?: boolean
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'vehicles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: params.owned ? { id: 'veh-1' } : null,
                  error: null,
                })),
              })),
            })),
          })),
        }
      }
      if (table === 'v_claim_full') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(async () =>
                params.claimFilterError
                  ? { data: null, error: { message: 'boom' } }
                  : { data: (params.allowedClaimIds ?? []).map((id) => ({ id })), error: null },
              ),
            })),
          })),
        }
      }
      if (table === 'claims') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: params.claimsData ?? [], error: null })),
            })),
          })),
        }
      }
      if (table === 'leads') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              // Kern-Draft-Query: .eq('vehicle_id').in('status').order(...)
              in: vi.fn(() => ({
                order: vi.fn(async () => ({ data: params.leadsData ?? [], error: null })),
              })),
              // Owner-Filter-Query: .eq('vehicle_id').eq('kunde_id')
              eq: vi.fn(async () => ({
                data: (params.allowedLeadIds ?? []).map((id) => ({ id })),
                error: null,
              })),
            })),
          })),
        }
      }
      return { select: vi.fn(() => ({})) }
    }),
  } as never
}

const CLAIM_A = {
  id: 'c1',
  claim_nummer: 'CLM-001',
  operative_status: 'filmcheck',
  schadentag: '2026-07-01',
  schadens_hoehe_netto: 1200,
  created_at: '2026-07-02T08:00:00Z',
}
const CLAIM_FREMD = {
  id: 'c-fremd',
  claim_nummer: 'CLM-FREMD',
  operative_status: 'abgeschlossen',
  schadentag: '2026-06-01',
  schadens_hoehe_netto: 9999,
  created_at: '2026-06-02T08:00:00Z',
}

describe('getKundeFahrzeugSchaeden', () => {
  it('leeres Ergebnis wenn das Fahrzeug nicht dem Kunden gehoert — Kern wird nie gequeried', async () => {
    const db = makeDb({ owned: false })
    const result = await getKundeFahrzeugSchaeden(db, 'user-1', 'veh-fremd')

    expect(result).toEqual({ claims: [], drafts: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls: string[] = (db as any).from.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(calls).not.toContain('claims')
    expect(calls).not.toContain('leads')
  })

  it('liefert Claims + Drafts wenn der Kunde Owner ist', async () => {
    const db = makeDb({
      owned: true,
      claimsData: [CLAIM_A],
      leadsData: [{ id: 'l1', status: 'neu', created_at: '2026-07-03T08:00:00Z' }],
      allowedClaimIds: ['c1'],
      allowedLeadIds: ['l1'],
    })
    const result = await getKundeFahrzeugSchaeden(db, 'user-1', 'veh-1')

    expect(result.claims).toEqual([
      {
        claimId: 'c1',
        claimNummer: 'CLM-001',
        status: 'filmcheck',
        schadentag: '2026-07-01',
        schadensHoeheNetto: 1200,
        createdAt: '2026-07-02T08:00:00Z',
      },
    ])
    expect(result.drafts).toEqual([
      { leadId: 'l1', status: 'neu', createdAt: '2026-07-03T08:00:00Z' },
    ])
  })

  it('Cross-Owner-Leak-Schutz: fremde Claims/Drafts am eigenen Fahrzeug werden NICHT gelistet', async () => {
    const db = makeDb({
      owned: true,
      claimsData: [CLAIM_A, CLAIM_FREMD],
      leadsData: [
        { id: 'l1', status: 'neu', created_at: '2026-07-03T08:00:00Z' },
        { id: 'l-fremd', status: 'neu', created_at: '2026-07-04T08:00:00Z' },
      ],
      allowedClaimIds: ['c1'],
      allowedLeadIds: ['l1'],
    })
    const result = await getKundeFahrzeugSchaeden(db, 'user-1', 'veh-1')

    expect(result.claims.map((c) => c.claimId)).toEqual(['c1'])
    expect(result.drafts.map((d) => d.leadId)).toEqual(['l1'])
  })

  it('fail-closed: Fehler der Owner-Filter-Query -> leere Claim-Liste (kein Leak)', async () => {
    const db = makeDb({
      owned: true,
      claimsData: [CLAIM_A],
      allowedClaimIds: ['c1'],
      claimFilterError: true,
    })
    const result = await getKundeFahrzeugSchaeden(db, 'user-1', 'veh-1')
    expect(result.claims).toEqual([])
  })
})
