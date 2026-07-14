import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const getUser = vi.fn(
  async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: { id: 'u1' } } }),
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, rpc })),
}))

describe('GET /api/search', () => {
  beforeEach(() => {
    rpc.mockReset()
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
})
