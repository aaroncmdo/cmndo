import { describe, it, expect } from 'vitest'
import { resolveKontoFirma } from './konto-firma'

function fakeDb(kontoRow: { firma_id: string } | null, firma: Record<string, unknown> | null) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: table === 'firmen_flotten_konten' ? kontoRow : firma }) }),
          maybeSingle: async () => ({ data: table === 'firmen_flotten_konten' ? kontoRow : firma }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('resolveKontoFirma', () => {
  it('resolves via firmen_flotten_konten for flottenmanager', async () => {
    const db = fakeDb({ firma_id: 'f1' }, { id: 'f1', name: 'Flotte GmbH', rechtsform: null, ust_id: null, adresse_strasse: null, adresse_plz: null, adresse_ort: null })
    const res = await resolveKontoFirma(db, 'u1', 'flottenmanager')
    expect(res?.id).toBe('f1')
  })
  it('returns null when flottenmanager has no konto', async () => {
    const db = fakeDb(null, null)
    expect(await resolveKontoFirma(db, 'u1', 'flottenmanager')).toBeNull()
  })
})
