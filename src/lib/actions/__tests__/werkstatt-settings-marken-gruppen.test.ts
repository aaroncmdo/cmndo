import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks müssen VOR dem Import der getesteten Actions definiert werden ──
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Supabase SSR-Client (Benutzer-Scope) — schreibt via RLS-Backstop (user_id = auth.uid()),
// nicht Admin-Bypass. from().update().eq()-Kette wie bei setMeineFaehigkeiten.
const eqMock = vi.fn()
const updateMock = vi.fn()
const fromServerMock = vi.fn()

const userMock = { id: 'user-123' }
const serverClient = {
  auth: { getUser: vi.fn() },
  from: fromServerMock,
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(serverClient)),
}))

import { setMeineMarken, setMeineFahrzeugGruppen } from '../werkstatt-settings'
import { revalidatePath } from 'next/cache'

beforeEach(() => {
  vi.clearAllMocks()
  serverClient.auth.getUser.mockResolvedValue({ data: { user: userMock }, error: null })
  eqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: eqMock })
  fromServerMock.mockReturnValue({ update: updateMock })
})

describe('setMeineMarken', () => {
  it('trim + dedupe + non-empty → update via SSR-Client mit .eq("user_id") (IDOR-Guard)', async () => {
    const result = await setMeineMarken([' BMW ', 'BMW', '', '   ', 'Audi'])

    expect(result).toEqual({ ok: true })
    expect(fromServerMock).toHaveBeenCalledWith('werkstaetten')
    expect(updateMock).toHaveBeenCalledWith({ marken: ['BMW', 'Audi'] })
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-123')
    expect(revalidatePath).toHaveBeenCalledWith('/werkstatt/einstellungen')
  })

  it('nicht angemeldet → { ok: false }, kein Write', async () => {
    serverClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await setMeineMarken(['BMW'])
    expect(result.ok).toBe(false)
    expect(fromServerMock).not.toHaveBeenCalled()
  })

  it('DB-Fehler → { ok: false, error }', async () => {
    eqMock.mockResolvedValue({ error: { message: 'DB down' } })
    const result = await setMeineMarken(['BMW'])
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe('DB down')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('setMeineFahrzeugGruppen', () => {
  it('unbekannte Werte gefiltert, gültige übernommen', async () => {
    const result = await setMeineFahrzeugGruppen(['pkw', 'quatsch', 'lkw', 'transporter'])

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({ fahrzeug_gruppen: ['pkw', 'lkw', 'transporter'] })
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-123')
  })

  it('alle ungültig → update mit []', async () => {
    const result = await setMeineFahrzeugGruppen(['xxx', 'yyy'])
    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({ fahrzeug_gruppen: [] })
  })

  it('nicht angemeldet → { ok: false }', async () => {
    serverClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await setMeineFahrzeugGruppen(['pkw'])
    expect(result.ok).toBe(false)
    expect(fromServerMock).not.toHaveBeenCalled()
  })
})
