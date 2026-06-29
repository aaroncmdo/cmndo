// src/lib/linkedin/__tests__/token.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isExpired } from '../token'

// ---- mock admin client ----
let mockUpdatePayload: Record<string, unknown> | null = null
let mockUpdateError: { message: string } | null = null

const mockAdmin = {
  from: (table: string) => {
    if (table === 'linkedin_oauth_tokens') {
      return {
        select: (_cols: string) => ({
          order: (_col: string, _opts?: unknown) => ({
            limit: (_n: number) => ({
              maybeSingle: () => Promise.resolve({ data: mockTokenRow }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          mockUpdatePayload = payload
          return {
            eq: (_col: string, _val: unknown) =>
              Promise.resolve({ error: mockUpdateError }),
          }
        },
      }
    }
    throw new Error(`unexpected table: ${table}`)
  },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockAdmin }))

// ---- shared token row fixtures ----
const EXPIRED_ROW = {
  id: 'row-1',
  organization_urn: 'urn:li:organization:99',
  access_token: 'old-access',
  refresh_token: 'valid-refresh',
  expires_at: '2026-01-01T00:00:00Z', // clearly in the past
  scope: null,
  connected_by: null,
}

const NO_REFRESH_ROW = {
  ...EXPIRED_ROW,
  refresh_token: null,
}

const VALID_ROW = {
  ...EXPIRED_ROW,
  expires_at: '2099-01-01T00:00:00Z', // far future
}

let mockTokenRow: typeof EXPIRED_ROW | null = EXPIRED_ROW

// ---- stub fetch ----
function makeOkFetch(newAccessToken = 'new-access-token') {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({ access_token: newAccessToken, expires_in: 3600 }),
  } as unknown as Response)
}

function makeFailFetch(status = 400) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
  } as unknown as Response)
}

// ---- dynamic import so mock is applied before module load ----
async function getValidLinkedInToken(deps?: { fetch?: typeof fetch }) {
  const mod = await import('../token')
  return mod.getValidLinkedInToken(deps)
}

// ---- tests ----

describe('isExpired', () => {
  const now = new Date('2026-06-29T12:00:00Z').getTime()
  it('true when past expiry', () => {
    expect(isExpired('2026-06-29T11:00:00Z', now)).toBe(true)
  })
  it('true when within the 5-min buffer', () => {
    expect(isExpired('2026-06-29T12:03:00Z', now)).toBe(true)
  })
  it('false when comfortably valid', () => {
    expect(isExpired('2026-06-29T13:00:00Z', now)).toBe(false)
  })
})

describe('getValidLinkedInToken — refresh path', () => {
  beforeEach(() => {
    mockTokenRow = EXPIRED_ROW
    mockUpdatePayload = null
    mockUpdateError = null
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
    process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret'
  })

  it('(a) refreshes expired token, returns new token+orgUrn, persists to DB', async () => {
    const stubFetch = makeOkFetch('fresh-token')
    const result = await getValidLinkedInToken({ fetch: stubFetch as unknown as typeof fetch })

    expect(result).toEqual({ ok: true, token: 'fresh-token', orgUrn: 'urn:li:organization:99' })
    expect(stubFetch).toHaveBeenCalledOnce()
    expect(mockUpdatePayload).not.toBeNull()
    expect(mockUpdatePayload).toMatchObject({ access_token: 'fresh-token', aktualisiert_am: expect.any(String) })
  })

  it('(b) returns ok:false without calling fetch when refresh_token is missing', async () => {
    mockTokenRow = NO_REFRESH_ROW
    const stubFetch = makeOkFetch()
    const result = await getValidLinkedInToken({ fetch: stubFetch as unknown as typeof fetch })

    expect(result.ok).toBe(false)
    expect(stubFetch).not.toHaveBeenCalled()
  })

  it('(c) returns ok:false when HTTP refresh response is non-OK', async () => {
    const stubFetch = makeFailFetch(401)
    const result = await getValidLinkedInToken({ fetch: stubFetch as unknown as typeof fetch })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/401/)
    expect(mockUpdatePayload).toBeNull()
  })

  it('returns ok:false when LINKEDIN_CLIENT_ID is unset', async () => {
    delete process.env.LINKEDIN_CLIENT_ID
    const stubFetch = makeOkFetch()
    const result = await getValidLinkedInToken({ fetch: stubFetch as unknown as typeof fetch })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/LINKEDIN_CLIENT_ID/)
    expect(stubFetch).not.toHaveBeenCalled()
  })

  it('returns ok:false when LINKEDIN_CLIENT_SECRET is unset', async () => {
    delete process.env.LINKEDIN_CLIENT_SECRET
    const stubFetch = makeOkFetch()
    const result = await getValidLinkedInToken({ fetch: stubFetch as unknown as typeof fetch })

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/nicht konfiguriert/)
    expect(stubFetch).not.toHaveBeenCalled()
  })

  it('returns ok:true even when DB persist fails (self-healing)', async () => {
    mockUpdateError = { message: 'DB write error' }
    const stubFetch = makeOkFetch('fresh-token-2')
    const result = await getValidLinkedInToken({ fetch: stubFetch as unknown as typeof fetch })

    expect(result).toEqual({ ok: true, token: 'fresh-token-2', orgUrn: 'urn:li:organization:99' })
  })

  it('skips refresh entirely when token is not expired', async () => {
    mockTokenRow = VALID_ROW
    const stubFetch = makeOkFetch()
    const result = await getValidLinkedInToken({ fetch: stubFetch as unknown as typeof fetch })

    expect(result).toEqual({ ok: true, token: 'old-access', orgUrn: 'urn:li:organization:99' })
    expect(stubFetch).not.toHaveBeenCalled()
  })
})
