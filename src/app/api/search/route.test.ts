import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const getUser = vi.fn(
  async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: { id: 'u1' } } }),
)

// Die Route liest seit der Makler-Weiche zuerst profiles.rolle und waehlt danach die
// RPC (pick-rpc.ts). Ohne `from` im Mock starb sie mit "supabase.from is not a function".
let rolle: string | null = 'admin'
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { rolle } }) }) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, rpc, from })),
}))

describe('GET /api/search', () => {
  beforeEach(() => {
    rpc.mockReset()
    from.mockClear()
    rolle = 'admin'
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('gibt gruppierte, deduplizierte Treffer zurueck', async () => {
    rpc.mockResolvedValue({
      data: [
        { entity_type: 'claim', id: 'c1', label: 'CLM-1', sub: null, status: 'offen', score: 0.4 },
        { entity_type: 'claim', id: 'c1', label: 'B-MW-123', sub: 'CLM-1', status: 'offen', score: 0.9 },
        { entity_type: 'lead', id: 'l1', label: 'Max Muster', sub: null, status: 'neu', score: 0.6 },
      ],
      error: null,
    })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://x/api/search?q=CLM'))
    const body = await res.json()
    expect(body.ok).toBe(true)
    const claim = body.groups.find((g: { entityType: string }) => g.entityType === 'claim')
    expect(claim.hits).toHaveLength(1) // dedupliziert
    expect(claim.hits[0].score).toBe(0.9)
  })

  it('zu kurzer Query -> leere Gruppen, ohne RPC-Aufruf', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('http://x/api/search?q=a'))
    const body = await res.json()
    expect(body.groups).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('nicht angemeldet -> 401', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://x/api/search?q=CLM'))
    expect(res.status).toBe(401)
  })

  // Makler haben kein claims-RLS: search_global gaebe ihnen 0 Claims und Leads,
  // deren Links nach /dispatch/leads zeigen (403). Die Weiche muss halten.
  it('Makler -> search_makler, alle anderen Rollen -> search_global', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const { GET } = await import('./route')

    rolle = 'makler'
    await GET(new Request('http://x/api/search?q=CLM'))
    expect(rpc.mock.calls.at(-1)?.[0]).toBe('search_makler')

    for (const r of ['admin', 'dispatch', 'sachverstaendiger', 'kunde', null]) {
      rolle = r
      await GET(new Request('http://x/api/search?q=CLM'))
      expect(rpc.mock.calls.at(-1)?.[0]).toBe('search_global')
    }
  })
})
