import { describe, it, expect, vi } from 'vitest'
import { getVertriebRollup } from './get-vertrieb-rollup'
import type { VertriebKontaktRow } from './vertrieb-kontakt.types'

function mockClient(rows: VertriebKontaktRow[]) {
  const builder = { select: vi.fn(() => builder), order: vi.fn(() => Promise.resolve({ data: rows, error: null })) }
  return { from: vi.fn(() => builder) } as unknown as Parameters<typeof getVertriebRollup>[0]
}
const row = (id: string, o: Partial<VertriebKontaktRow>): VertriebKontaktRow => ({
  id, kind: 'sv', name: null, email: null, telefon: null, plz: null, ort: null,
  lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null,
  roh_status: null, roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null,
  roh_portal_zugang: null, roh_onboarding_offen: null, roh_warteliste: null, notizen: null,
  rolle: null, ...o,
})

describe('getVertriebRollup', () => {
  it('gruppiert nach kind x stufe (abgeleitet)', async () => {
    const client = mockClient([
      row('a', { kind: 'sv', roh_gesperrt: true }),
      row('b', { kind: 'sv', roh_gesperrt: true }),
      row('c', { kind: 'makler', roh_status: 'aktiv' }),
    ])
    const res = await getVertriebRollup(client)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.find((z) => z.kind === 'sv' && z.stufe === 'gesperrt')?.anzahl).toBe(2)
      expect(res.data.find((z) => z.kind === 'makler' && z.stufe === 'aktiv')?.anzahl).toBe(1)
    }
  })
  it('reicht Loader-Fehler durch', async () => {
    const builder = { select: vi.fn(() => builder), order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'x' } })) }
    const client = { from: vi.fn(() => builder) } as unknown as Parameters<typeof getVertriebRollup>[0]
    const res = await getVertriebRollup(client)
    expect(res).toEqual({ ok: false, error: 'x' })
  })
})
