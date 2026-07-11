import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks müssen VOR dem Import der getesteten Action definiert werden ──

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Supabase SSR-Client (Benutzer-Scope)
const updateMock = vi.fn()
const eqMock = vi.fn()
const fromServerMock = vi.fn()

const userMock = { id: 'user-123' }
const serverClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: fromServerMock,
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(serverClient)),
}))

// Supabase Admin-Client (werkstatt update)
const adminEqMock = vi.fn()
const adminUpdateMock = vi.fn()
const adminFromMock = vi.fn()
const adminClient = {
  from: adminFromMock,
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminClient),
}))

import { setMeineFaehigkeiten } from '../werkstatt-settings'
import { revalidatePath } from 'next/cache'

describe('setMeineFaehigkeiten', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: Benutzer angemeldet
    serverClient.auth.getUser.mockResolvedValue({ data: { user: userMock }, error: null })

    // Admin from().update().eq() chain
    adminEqMock.mockResolvedValue({ error: null })
    adminUpdateMock.mockReturnValue({ eq: adminEqMock })
    adminFromMock.mockReturnValue({ update: adminUpdateMock })
  })

  it('gültige Gewerke → update mit .eq("user_id", user.id) aufgerufen', async () => {
    const result = await setMeineFaehigkeiten(['karosserie', 'lackierung'])

    expect(result).toEqual({ ok: true })
    expect(adminFromMock).toHaveBeenCalledWith('werkstaetten')
    expect(adminUpdateMock).toHaveBeenCalledWith({ faehigkeiten: ['karosserie', 'lackierung'] })
    expect(adminEqMock).toHaveBeenCalledWith('user_id', 'user-123')
    expect(revalidatePath).toHaveBeenCalledWith('/werkstatt/einstellungen')
  })

  it('ungültige Werte werden herausgefiltert, gültige übernommen', async () => {
    const result = await setMeineFaehigkeiten(['karosserie', 'invalid_gewerk', 'xss', 'mechanik'])

    expect(result).toEqual({ ok: true })
    expect(adminUpdateMock).toHaveBeenCalledWith({ faehigkeiten: ['karosserie', 'mechanik'] })
  })

  it('leere Liste nach Filterung → update mit [] (alle ungültig)', async () => {
    const result = await setMeineFaehigkeiten(['invalid', 'also_invalid'])

    expect(result).toEqual({ ok: true })
    expect(adminUpdateMock).toHaveBeenCalledWith({ faehigkeiten: [] })
  })

  it('nicht angemeldet → { ok: false }', async () => {
    serverClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await setMeineFaehigkeiten(['karosserie'])

    expect(result.ok).toBe(false)
    expect(adminFromMock).not.toHaveBeenCalled()
  })

  it('DB-Fehler → { ok: false, error }', async () => {
    adminEqMock.mockResolvedValue({ error: { message: 'DB connection failed' } })

    const result = await setMeineFaehigkeiten(['mechanik'])

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe('DB connection failed')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
