import { describe, it, expect, vi } from 'vitest'
import { getVertriebKontakte } from './get-vertrieb-kontakte'
import type { VertriebKontaktRow } from './vertrieb-kontakt.types'

// Der Supabase-Chain (.from().select().order()) ist thenable beim await.
function mockClient(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
  }
  return { from: vi.fn(() => builder) } as unknown as Parameters<typeof getVertriebKontakte>[0]
}

const row = (o: Partial<VertriebKontaktRow>): VertriebKontaktRow => ({
  id: 'a', kind: 'sv', name: 'X', email: null, telefon: null, plz: null, ort: null,
  lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null,
  roh_status: null, roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null,
  roh_portal_zugang: null, roh_onboarding_offen: null, roh_warteliste: null, ...o,
})

describe('getVertriebKontakte', () => {
  it('mappt Rows via deriveVertriebState (stufe abgeleitet)', async () => {
    const client = mockClient({ data: [row({ kind: 'sv', roh_gesperrt: true })], error: null })
    const res = await getVertriebKontakte(client)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toHaveLength(1)
      expect(res.data[0].stufe).toBe('gesperrt')
    }
  })
  it('DB-Fehler -> { ok:false, error }', async () => {
    const client = mockClient({ data: null, error: { message: 'boom' } })
    const res = await getVertriebKontakte(client)
    expect(res).toEqual({ ok: false, error: 'boom' })
  })
  it('leere Daten -> ok mit []', async () => {
    const client = mockClient({ data: null, error: null })
    const res = await getVertriebKontakte(client)
    expect(res).toEqual({ ok: true, data: [] })
  })
})
