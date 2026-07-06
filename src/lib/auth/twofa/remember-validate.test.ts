import { describe, it, expect } from 'vitest'
import { validateRememberCookie } from './remember-validate'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const FUTURE = new Date(Date.now() + 60_000).toISOString()
const PAST = new Date(Date.now() - 60_000).toISOString()

// Chainable Supabase-Mock: .from().select().eq().eq().is().maybeSingle()
function mockClient(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.is = () => chain
  chain.maybeSingle = async () => result
  return { from: () => chain } as never
}

describe('validateRememberCookie', () => {
  it('false bei fehlendem Cookie', async () => {
    expect(await validateRememberCookie(mockClient({ data: null, error: null }), USER, undefined)).toBe(false)
  })

  it('false bei malformed Cookie (kein Doppelpunkt)', async () => {
    expect(await validateRememberCookie(mockClient({ data: null, error: null }), USER, 'nocolon')).toBe(false)
  })

  it('false bei userId-Mismatch (Cross-User)', async () => {
    // Zeile existiert zwar, aber Cookie-userId != Session-userId -> nie DB-Lookup
    const r = await validateRememberCookie(
      mockClient({ data: { id: 'x', expires_at: FUTURE }, error: null }),
      USER,
      `${OTHER}:rawtoken`,
    )
    expect(r).toBe(false)
  })

  it('false bei KEINER passenden DB-Zeile (Bypass-Angriff: Cookie gefaelscht)', async () => {
    const r = await validateRememberCookie(mockClient({ data: null, error: null }), USER, `${USER}:garbage`)
    expect(r).toBe(false)
  })

  it('false bei abgelaufenem Token', async () => {
    const r = await validateRememberCookie(
      mockClient({ data: { id: 'x', expires_at: PAST }, error: null }),
      USER,
      `${USER}:rawtoken`,
    )
    expect(r).toBe(false)
  })

  it('false bei DB-Error (fail-closed)', async () => {
    const r = await validateRememberCookie(
      mockClient({ data: null, error: { message: 'boom' } }),
      USER,
      `${USER}:rawtoken`,
    )
    expect(r).toBe(false)
  })

  it('true bei gueltigem Token (userId-match, Zeile da, nicht expired)', async () => {
    const r = await validateRememberCookie(
      mockClient({ data: { id: 'x', expires_at: FUTURE }, error: null }),
      USER,
      `${USER}:rawtoken`,
    )
    expect(r).toBe(true)
  })
})
