import { describe, it, expect, vi } from 'vitest'
import { getFallById } from './queries'

// Mock-Chain: .from().select().eq().maybeSingle() -> { data }
function chain(data: unknown) {
  return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) }) }
}

describe('getFallById accept-both (CMM-63)', () => {
  it('findet per fall_id (id) direkt', async () => {
    const supabase = { from: vi.fn().mockReturnValue(chain({ id: 'f1', claim_id: 'c1' })) }
    const r = await getFallById(supabase as never, 'f1')
    expect(r).toMatchObject({ id: 'f1' })
    expect(supabase.from).toHaveBeenCalledTimes(1) // kein Fallback noetig
  })

  it('faellt auf claim_id zurueck, wenn der id-Lookup leer ist', async () => {
    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(chain(null)) // by id -> leer
        .mockReturnValueOnce(chain({ id: 'f1', claim_id: 'c1' })), // by claim_id -> Treffer
    }
    const r = await getFallById(supabase as never, 'c1')
    expect(r).toMatchObject({ id: 'f1', claim_id: 'c1' })
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('gibt null, wenn beide Lookups leer sind', async () => {
    const supabase = { from: vi.fn().mockReturnValue(chain(null)) }
    const r = await getFallById(supabase as never, 'x')
    expect(r).toBeNull()
  })
})
