// Fokus: Admin-Gate + Validierung der QR-Pool-Actions (ohne echte DB).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ user: null as { id: string } | null, rolle: null as string | null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: vi.fn().mockImplementation(async () => ({ data: { user: state.user } })) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(async () => ({
        data: state.rolle ? { id: state.user?.id, rolle: state.rolle } : null,
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    })),
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  state.user = null
  state.rolle = null
  vi.clearAllMocks()
})

describe('generateQrPoolBatch', () => {
  it('nicht-admin -> ok:false', async () => {
    const { generateQrPoolBatch } = await import('../qr-pool-actions')
    expect((await generateQrPoolBatch(5)).ok).toBe(false)
  })
  it('admin + ungueltige Anzahl -> ok:false', async () => {
    state.user = { id: 'a' }; state.rolle = 'admin'
    const { generateQrPoolBatch } = await import('../qr-pool-actions')
    expect((await generateQrPoolBatch(0)).ok).toBe(false)
    expect((await generateQrPoolBatch(999)).ok).toBe(false)
  })
  it('admin + gueltige Anzahl -> ok:true mit N Tokens', async () => {
    state.user = { id: 'a' }; state.rolle = 'admin'
    const { generateQrPoolBatch } = await import('../qr-pool-actions')
    const r = await generateQrPoolBatch(3)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.tokens).toHaveLength(3)
      r.tokens.forEach((t) => expect(t).toMatch(/^WQR-/))
    }
  })
})

describe('weiseQrPoolCodeZu', () => {
  it('nicht-admin -> ok:false', async () => {
    const { weiseQrPoolCodeZu } = await import('../qr-pool-actions')
    expect((await weiseQrPoolCodeZu('w1', 'WQR-ABCD2345')).ok).toBe(false)
  })
  it('admin + leerer Token -> ok:false', async () => {
    state.user = { id: 'a' }; state.rolle = 'admin'
    const { weiseQrPoolCodeZu } = await import('../qr-pool-actions')
    expect((await weiseQrPoolCodeZu('w1', '')).ok).toBe(false)
  })
  it('admin + unbekannter Token -> ok:false', async () => {
    state.user = { id: 'a' }; state.rolle = 'admin'
    const { weiseQrPoolCodeZu } = await import('../qr-pool-actions')
    expect((await weiseQrPoolCodeZu('w1', 'WQR-ZZZZ2345')).ok).toBe(false)
  })
})
