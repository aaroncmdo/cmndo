import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/storage/url', () => ({ getStorageUrl: vi.fn(async () => 'https://storage/x.pdf') }))
// Beweis "OHNE Transition": ein Import der State-Machine wuerde hier auffallen — zusaetzlich
// asserten wir unten, dass der Mock nie angefasst wird.
vi.mock('@/lib/faelle/state-machine', () => ({ transitionFallStatus: vi.fn() }))

import { attachGutachtenOhneTransition } from '../attach-gutachten-ohne-transition'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

type Op = { table: string; op: string; payload?: unknown }
const operations: Op[] = []
let uploadError: { message: string } | null = null

function fakeAdmin() {
  return {
    storage: {
      from: () => ({ upload: async () => ({ error: uploadError }) }),
    },
    from: (table: string) => ({
      insert: (p: unknown) => {
        operations.push({ table, op: 'insert', payload: p })
        return Promise.resolve({ error: null })
      },
      upsert: (p: unknown) => {
        operations.push({ table, op: 'upsert', payload: p })
        return Promise.resolve({ error: null })
      },
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { paket_faelle_genutzt: 2 }, error: null }),
        }),
      }),
      update: (p: unknown) => ({
        eq: () => {
          operations.push({ table, op: 'update', payload: p })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  } as never
}

const input = {
  claimId: 'c1',
  fallId: 'f1',
  svId: 'sv-1',
  file: new File(['pdf'], 'gutachten.pdf', { type: 'application/pdf' }),
  betrag: 4200,
  userId: 'u1',
}

beforeEach(() => {
  operations.length = 0
  uploadError = null
  vi.mocked(transitionFallStatus).mockClear()
})

describe('attachGutachtenOhneTransition (P4 T7)', () => {
  it('fall_dokumente-Insert + gutachten-Upsert + Zaehler-Increment, KEINE Transition', async () => {
    const r = await attachGutachtenOhneTransition(fakeAdmin(), input)
    expect(r).toEqual({ ok: true })

    const doc = operations.find((o) => o.table === 'fall_dokumente' && o.op === 'insert')
    expect(doc).toBeTruthy()
    expect((doc!.payload as Record<string, unknown>).dokument_typ).toBe('gutachten')
    expect((doc!.payload as Record<string, unknown>).uploaded_by_sv).toBe(true)

    const g = operations.find((o) => o.table === 'gutachten' && o.op === 'upsert')
    expect(g).toBeTruthy()
    const gp = g!.payload as Record<string, unknown>
    expect(gp.claim_id).toBe('c1')
    expect(gp.sv_id).toBe('sv-1')
    expect(gp.gesamt_schadensbetrag).toBe(4200)
    expect(gp.fertiggestellt_am).toBeTruthy()

    const z = operations.find((o) => o.table === 'sachverstaendige' && o.op === 'update')
    expect((z!.payload as Record<string, unknown>).paket_faelle_genutzt).toBe(3)

    expect(transitionFallStatus).not.toHaveBeenCalled()
  })

  it('Upload-Fehler -> { ok:false }, keine DB-Writes', async () => {
    uploadError = { message: 'bucket full' }
    const r = await attachGutachtenOhneTransition(fakeAdmin(), input)
    expect(r.ok).toBe(false)
    expect(operations).toHaveLength(0)
  })
})
