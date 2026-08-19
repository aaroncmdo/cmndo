import { describe, it, expect, vi, beforeEach } from 'vitest'

type Result = { data: unknown; error: unknown }

function makeQuery(result: Result) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => q
  q.single = async () => result
  q.maybeSingle = async () => result
  q.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve)
  return q
}

const from = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from }),
}))

import {
  getVersichererDetail,
  getVersichererFaelle,
  getVersichererKorrespondenz,
} from './queries'

const VS_ROW = {
  id: 'v1',
  name: 'Muster Versicherung AG',
  normalized_name: 'muster versicherung',
  bafin_nummer: '1234',
  adresse: 'Hauptstr. 1',
  plz: '10115',
  stadt: 'Berlin',
  schaden_telefon: '+49301234',
  schaden_email: 'schaden@muster.de',
  hotline_telefon: null,
  webseite: 'https://muster.de',
  logo_url: null,
  ist_aktiv: true,
  erstellt_am: '2026-01-01T00:00:00Z',
  aktualisiert_am: '2026-02-01T00:00:00Z',
}

beforeEach(() => from.mockReset())

describe('getVersichererDetail', () => {
  it('liefert ok:false bei Query-Fehler', async () => {
    from.mockReturnValueOnce(makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await getVersichererDetail('v1')).toEqual({ ok: false, error: 'boom' })
  })

  it('liefert ok:false wenn der Versicherer nicht existiert', async () => {
    from.mockReturnValueOnce(makeQuery({ data: null, error: null }))
    expect((await getVersichererDetail('nope')).ok).toBe(false)
  })

  it('mappt alle Felder inkl. der in der Liste versteckten', async () => {
    from.mockReturnValueOnce(makeQuery({ data: VS_ROW, error: null }))
    const res = await getVersichererDetail('v1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.name).toBe('Muster Versicherung AG')
    expect(res.data.bafinNummer).toBe('1234')
    // in der Liste unsichtbar:
    expect(res.data.normalizedName).toBe('muster versicherung')
    expect(res.data.erstelltAm).toBe('2026-01-01T00:00:00Z')
    expect(res.data.istAktiv).toBe(true)
  })

  it('behandelt ist_aktiv=null als inaktiv (DB erlaubt null)', async () => {
    from.mockReturnValueOnce(makeQuery({ data: { ...VS_ROW, ist_aktiv: null }, error: null }))
    const res = await getVersichererDetail('v1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.istAktiv).toBe(false)
  })
})

describe('getVersichererFaelle', () => {
  it('mappt die Faelle des Gegner-Versicherers', async () => {
    from.mockReturnValueOnce(
      makeQuery({
        // Spaltenname wie in der DB: T3-slice-2b hat claims.status -> operative_status
        // umbenannt. Der Mock lieferte weiter `status`, der Code liest `operative_status`
        // -> gemappt kam `undefined` heraus. Der Produktionscode war korrekt.
        data: [{ id: 'c1', claim_nummer: 'CL-1', operative_status: 'offen', created_at: '2026-03-01' }],
        error: null,
      }),
    )
    const rows = await getVersichererFaelle('v1')
    expect(rows).toEqual([
      { id: 'c1', claimNummer: 'CL-1', status: 'offen', createdAt: '2026-03-01' },
    ])
  })

  it('liefert [] bei Fehler (Tab bleibt leer statt zu crashen)', async () => {
    from.mockReturnValueOnce(makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await getVersichererFaelle('v1')).toEqual([])
  })
})

describe('getVersichererKorrespondenz', () => {
  it('mappt die VS-Korrespondenz ueber alle Faelle', async () => {
    from.mockReturnValueOnce(
      makeQuery({
        data: [
          {
            id: 'k1',
            claim_id: 'c1',
            datum: '2026-03-02',
            richtung: 'ausgehend',
            kanal: 'email',
            typ: 'anschreiben',
            betreff: 'Schadenmeldung',
            status: 'offen',
            aktenzeichen: 'AZ-9',
            naechste_frist: '2026-03-16',
          },
        ],
        error: null,
      }),
    )
    const rows = await getVersichererKorrespondenz('v1')
    expect(rows).toHaveLength(1)
    expect(rows[0].claimId).toBe('c1')
    expect(rows[0].aktenzeichen).toBe('AZ-9')
    expect(rows[0].naechsteFrist).toBe('2026-03-16')
  })

  it('liefert [] bei Fehler', async () => {
    from.mockReturnValueOnce(makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await getVersichererKorrespondenz('v1')).toEqual([])
  })
})
