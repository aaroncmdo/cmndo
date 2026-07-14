import { describe, it, expect, vi } from 'vitest'
import { resolveMusik } from './music-resolver'

function mockSupabase(listData: { name: string }[] | null, listError: unknown = null) {
  return {
    storage: {
      from: vi.fn(() => ({
        list: vi.fn().mockResolvedValue({ data: listData, error: listError }),
        getPublicUrl: vi.fn((k: string) => ({ data: { publicUrl: `https://cdn/${k}` } })),
      })),
    },
  } as never
}

describe('resolveMusik', () => {
  it('liefert die Public-URL, wenn der Track fuer die Stimmung existiert', async () => {
    const sb = mockSupabase([{ name: 'ruhig.mp3' }])
    expect(await resolveMusik('ruhig', sb)).toBe('https://cdn/music/ruhig.mp3')
  })

  it('liefert null, wenn kein passender Track vorhanden ist (Bett bleibt aus)', async () => {
    const sb = mockSupabase([])
    expect(await resolveMusik('dringlich', sb)).toBeNull()
  })

  it('faellt auf serioes zurueck, wenn keine Stimmung gesetzt ist', async () => {
    const sb = mockSupabase([{ name: 'serioes.mp3' }])
    expect(await resolveMusik(undefined, sb)).toBe('https://cdn/music/serioes.mp3')
  })

  it('liefert null bei Storage-Fehler', async () => {
    const sb = mockSupabase(null, { message: 'boom' })
    expect(await resolveMusik('ruhig', sb)).toBeNull()
  })
})
