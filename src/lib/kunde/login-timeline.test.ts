import { describe, it, expect, vi, beforeEach } from 'vitest'

const finde = vi.fn()
const insert = vi.fn()
vi.mock('@/lib/auth/lead-kontakt', () => ({ findeVorgaengeZuKontakt: (...a: unknown[]) => finde(...a) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => ({ insert: (p: unknown) => { insert(t, p); return Promise.resolve({ error: null }) } }) }),
}))

import { schreibeLoginTimeline } from './login-timeline'

beforeEach(() => { finde.mockReset(); insert.mockReset() })

describe('schreibeLoginTimeline', () => {
  it('schreibt je Lead einen System-Eintrag (Telefon-Weg)', async () => {
    finde.mockResolvedValue({ leadIds: ['L1', 'L2'], claimIds: [], leadEmail: null, leadVorname: null })
    await schreibeLoginTimeline({ id: 'U1', email: null, phone: '491775799941' }, 'telefon')
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenCalledWith('nachrichten', expect.objectContaining({
      lead_id: 'L1', kanal: 'gruppenchat', is_system: true, system_event: 'kunde_selbst_angemeldet', sender_rolle: 'system',
    }))
    expect((insert.mock.calls[0][1] as { nachricht: string }).nachricht).toMatch(/Telefonnummer/)
  })
  it('E-Mail-Weg: anderer Text', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: null, leadVorname: null })
    await schreibeLoginTimeline({ id: 'U1', email: 'k@example.test', phone: null }, 'email')
    expect((insert.mock.calls[0][1] as { nachricht: string }).nachricht).toMatch(/E-Mail-Link/)
  })
  it('kein Kontakt: nichts schreiben, nicht werfen', async () => {
    await expect(schreibeLoginTimeline({ id: 'U1' }, 'telefon')).resolves.toBeUndefined()
    expect(insert).not.toHaveBeenCalled()
  })
})
