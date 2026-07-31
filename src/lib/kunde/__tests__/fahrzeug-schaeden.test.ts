import { describe, it, expect, vi } from 'vitest'
import { getKundeFahrzeugSchaeden } from '../fahrzeug-schaeden'

function makeDb(params: {
  owned: boolean
  claimsData?: unknown[]
  leadsData?: unknown[]
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
              in: vi.fn(() => ({
                order: vi.fn(async () => ({ data: params.leadsData ?? [], error: null })),
              })),
            })),
          })),
        }
      }
      return { select: vi.fn(() => ({})) }
    }),
  } as never
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
      claimsData: [
        {
          id: 'c1',
          claim_nummer: 'CLM-001',
          operative_status: 'filmcheck',
          schadentag: '2026-07-01',
          schadens_hoehe_netto: 1200,
          created_at: '2026-07-02T08:00:00Z',
        },
      ],
      leadsData: [{ id: 'l1', status: 'neu', created_at: '2026-07-03T08:00:00Z' }],
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
})
