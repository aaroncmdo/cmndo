import { describe, it, expect } from 'vitest'
import { kanzleiTenancyScopingCheck } from '../kanzlei-tenancy-scoping'

// Mock: from('kanzleien').select().eq().not().not() -> {data,error}; rpc() -> {error}.
function mockCtx(
  firmen: { data?: unknown[] | null; error?: { message: string } | null },
  rpc?: { error?: { message: string } | null },
) {
  const p = Promise.resolve({ data: firmen.data ?? null, error: firmen.error ?? null })
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not']) chain[m] = () => chain
  chain.then = p.then.bind(p)
  chain.catch = p.catch.bind(p)
  chain.finally = p.finally.bind(p)
  return {
    supabase: {
      from: () => chain,
      rpc: () => Promise.resolve({ data: null, error: rpc?.error ?? null }),
    },
  } as unknown as Parameters<typeof kanzleiTenancyScopingCheck.run>[0]
}

const zweiFirmen = [
  { id: '1', name: 'Kanzlei Meier' },
  { id: '2', name: 'Kanzlei Schulze' },
]

describe('kanzleiTenancyScopingCheck (Multi-Mandanten-Tripwire)', () => {
  it('ok bei 0 realen Firmen', async () => {
    const res = await kanzleiTenancyScopingCheck.run(mockCtx({ data: [] }))
    expect(res.status).toBe('ok')
    expect(res.metric).toBe(0)
  })

  it('ok bei 1 realer Firma (Flat-Gate safe, Per-Firma erst ab 2 nötig)', async () => {
    const res = await kanzleiTenancyScopingCheck.run(mockCtx({ data: [{ id: '1', name: 'Kanzlei Meier' }] }))
    expect(res.status).toBe('ok')
    expect(res.metric).toBe(1)
  })

  it('CRIT bei >=2 Firmen + fehlendem is_kanzlei_for_claim (Tripwire feuert)', async () => {
    const res = await kanzleiTenancyScopingCheck.run(
      mockCtx({ data: zweiFirmen }, { error: { message: 'Could not find the function public.is_kanzlei_for_claim(p_claim_id) in the schema cache' } }),
    )
    expect(res.status).toBe('crit')
    expect(res.metric).toBe(2)
    expect(res.detail).toContain('SPEC-kanzlei-per-firma-scoping')
    expect(res.sampleIds).toEqual(['Kanzlei Meier', 'Kanzlei Schulze'])
  })

  it('ok bei >=2 Firmen wenn is_kanzlei_for_claim existiert (rpc kein Fehler = self-resolved)', async () => {
    const res = await kanzleiTenancyScopingCheck.run(mockCtx({ data: zweiFirmen }, { error: null }))
    expect(res.status).toBe('ok')
    expect(res.metric).toBe(2)
  })

  it('error-Status bei DB-Fehler', async () => {
    const res = await kanzleiTenancyScopingCheck.run(mockCtx({ data: null, error: { message: 'boom' } }))
    expect(res.status).toBe('error')
    expect(res.detail).toContain('boom')
  })
})
