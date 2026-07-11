import { describe, it, expect, vi } from 'vitest'

// Mock token generation so tests are deterministic
vi.mock('./token', () => ({
  generateSchadenkarteToken: vi.fn(() => 'SKT-AAAAAAAAAAAAAAAA'),
}))

import {
  mintSchadenkarten,
  bindeSchadenkarteAnFahrzeug,
  resolveSchadenkarteToFahrzeug,
  getKartenFuerFirma,
} from './schadenkarte'

// ---------------------------------------------------------------------------
// Helpers to build mock db chains
// ---------------------------------------------------------------------------

function makeDb(overrides: {
  selectResult?: unknown
  insertResult?: { error: { code: string; message: string } | null }
  updateResult?: { data: unknown; error: { code: string; message: string } | null }
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => overrides.selectResult ?? { data: null },
          }),
          maybeSingle: async () => overrides.selectResult ?? { data: null },
          order: () => ({ data: overrides.selectResult ?? null }),
        }),
        maybeSingle: async () => overrides.selectResult ?? { data: null },
      }),
      insert: async () => overrides.insertResult ?? { error: null },
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () =>
                overrides.updateResult ?? { data: { id: 'u1' }, error: null },
            }),
          }),
        }),
      }),
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

// ---------------------------------------------------------------------------
// mintSchadenkarten
// ---------------------------------------------------------------------------

describe('mintSchadenkarten', () => {
  it('rejects anzahl > 200', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = {} as any
    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 201 })
    expect(res.ok).toBe(false)
    expect((res as { ok: false; error: string }).error).toMatch(/200/)
  })

  it('rejects anzahl < 1', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await mintSchadenkarten({} as any, { firmaId: 'f1', anzahl: 0 })
    expect(res.ok).toBe(false)
  })

  it('returns tokens on success', async () => {
    const db = {
      from: () => ({ insert: async () => ({ error: null }) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 2 })
    expect(res.ok).toBe(true)
    expect((res as { ok: true; tokens: string[] }).tokens).toHaveLength(2)
  })

  it('retries on UNIQUE collision (23505) and succeeds on second attempt', async () => {
    const { generateSchadenkarteToken } = await import('./token')
    const mockGen = vi.mocked(generateSchadenkarteToken)
    mockGen.mockReturnValueOnce('SKT-COLLISION0000000').mockReturnValue('SKT-UNIQUE000000000')

    let call = 0
    const db = {
      from: () => ({
        insert: async () => {
          call++
          if (call === 1) return { error: { code: '23505', message: 'unique violation' } }
          return { error: null }
        },
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 1 })
    expect(res.ok).toBe(true)
    expect(call).toBe(2)
  })

  it('aborts on non-unique DB error', async () => {
    const db = {
      from: () => ({
        insert: async () => ({ error: { code: '42P01', message: 'relation missing' } }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await mintSchadenkarten(db, { firmaId: 'f1', anzahl: 1 })
    expect(res.ok).toBe(false)
    expect((res as { ok: false; error: string }).error).toMatch(/relation missing/)
  })
})

// ---------------------------------------------------------------------------
// bindeSchadenkarteAnFahrzeug
// ---------------------------------------------------------------------------

describe('bindeSchadenkarteAnFahrzeug', () => {
  it('returns error when card not found', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-UNKNOWN000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Karte nicht gefunden.')
  })

  it('returns error when card firma_id differs from caller firmaId', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'k1', status: 'frei', firma_id: 'ANDERE_FIRMA' },
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'MEINE_FIRMA',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Karte gehoert zu einer anderen Firma.')
  })

  it('returns error when card is already gebunden', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'k1', status: 'gebunden', firma_id: 'f1' },
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Karte ist bereits gebunden oder gesperrt.')
  })

  it('maps a 23505 on UPDATE to "Dieses Fahrzeug hat bereits eine aktive Karte."', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'k1', status: 'frei', firma_id: 'f1' },
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: '23505', message: 'unique_violation' },
                }),
              }),
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Dieses Fahrzeug hat bereits eine aktive Karte.')
  })

  it('succeeds when card is frei and update returns a row', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'k1', status: 'frei', firma_id: 'f1' },
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: 'k1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await bindeSchadenkarteAnFahrzeug(db, {
      token: 'SKT-TOKEN000000000',
      fahrzeugId: 'v1',
      firmaId: 'f1',
      userId: 'u1',
    })
    expect(res.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveSchadenkarteToFahrzeug
// ---------------------------------------------------------------------------

describe('resolveSchadenkarteToFahrzeug', () => {
  it('returns null for unknown token', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await resolveSchadenkarteToFahrzeug(db, 'SKT-UNKNOWN000000')
    expect(res).toBeNull()
  })

  it('returns fahrzeugId + firmaId + status for known token', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { fahrzeug_id: 'v1', firma_id: 'f1', status: 'gebunden' },
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await resolveSchadenkarteToFahrzeug(db, 'SKT-TOKEN000000000')
    expect(res).toEqual({ fahrzeugId: 'v1', firmaId: 'f1', status: 'gebunden' })
  })
})

// ---------------------------------------------------------------------------
// getKartenFuerFirma
// ---------------------------------------------------------------------------

describe('getKartenFuerFirma', () => {
  it('returns empty array when no rows', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ data: null }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await getKartenFuerFirma(db, 'f1')
    expect(res).toEqual([])
  })

  it('maps rows to camelCase shape', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              data: [
                { id: 'k1', karten_token: 'SKT-AAA', status: 'frei', fahrzeug_id: null },
                { id: 'k2', karten_token: 'SKT-BBB', status: 'gebunden', fahrzeug_id: 'v1' },
              ],
            }),
          }),
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const res = await getKartenFuerFirma(db, 'f1')
    expect(res).toEqual([
      { id: 'k1', token: 'SKT-AAA', status: 'frei', fahrzeugId: null },
      { id: 'k2', token: 'SKT-BBB', status: 'gebunden', fahrzeugId: 'v1' },
    ])
  })
})
