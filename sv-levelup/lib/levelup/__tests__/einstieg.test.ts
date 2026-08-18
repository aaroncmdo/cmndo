import { beforeEach, describe, expect, it } from 'vitest'
import { erzeugeToken, hashIp } from '../token'
import { darfNoch, RATE_GRENZE } from '../ratelimit'
import { loeseStandortAuf } from '../standort'
import { legeCheckAn } from '../einstieg'
import type { Db } from '../../anreicherung/schreiben'

const state = {
  rateZeilen: 0,
  rateFehler: null as string | null,
  plzTreffer: null as Record<string, unknown> | null,
  ortTreffer: null as Record<string, unknown> | null,
  ortMehrfach: [] as Record<string, unknown>[],
  inserts: [] as { tabelle: string; werte: Record<string, unknown> }[],
  insertFehler: null as string | null,
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'gfa_rate_limit') {
      return {
        select: () => ({
          eq: () => ({
            gte: async () =>
              state.rateFehler
                ? { data: null, error: { message: state.rateFehler }, count: null }
                : { data: Array.from({ length: state.rateZeilen }, (_, i) => ({ id: i })), error: null },
          }),
        }),
        insert: async (w: Record<string, unknown>) => {
          state.inserts.push({ tabelle, werte: w })
          return { error: null }
        },
      }
    }
    if (tabelle === 'plz_geo') {
      return {
        select: () => ({
          eq: (spalte: string) => ({
            // PLZ ist eindeutig -> maybeSingle ist dort korrekt
            maybeSingle: async () => ({
              data: spalte === 'plz' ? state.plzTreffer : state.ortTreffer,
              error: null,
            }),
            // Ort ist NICHT eindeutig -> sortierte Liste mit Limit
            order: () => ({
              limit: async () => ({
                data: state.ortMehrfach.length > 0
                  ? state.ortMehrfach
                  : (state.ortTreffer ? [state.ortTreffer] : []),
                error: null,
              }),
            }),
          }),
        }),
      }
    }
    if (tabelle === 'levelup_checks' || tabelle === 'levelup_events') {
      return {
        insert: (w: Record<string, unknown>) => {
          state.inserts.push({ tabelle, werte: w })
          return {
            select: () => ({
              single: async () =>
                state.insertFehler
                  ? { data: null, error: { message: state.insertFehler } }
                  : { data: { id: 'C1', ...w }, error: null },
            }),
            then: (aufl: (v: unknown) => unknown) =>
              Promise.resolve({ error: state.insertFehler ? { message: state.insertFehler } : null }).then(aufl),
          }
        },
      }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

beforeEach(() => {
  state.rateZeilen = 0
  state.rateFehler = null
  state.plzTreffer = null
  state.ortTreffer = null
  state.ortMehrfach = []
  state.inserts = []
  state.insertFehler = null
})

describe('erzeugeToken', () => {
  it('liefert 32 Zeichen aus dem erlaubten Alphabet', () => {
    const t = erzeugeToken()
    expect(t).toHaveLength(32)
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  // Vorhersagbare Token waeren ein Zugang zu fremden Befunden
  it('ist in 2000 Ziehungen dublettenfrei', () => {
    const menge = new Set(Array.from({ length: 2000 }, () => erzeugeToken()))
    expect(menge.size).toBe(2000)
  })
})

describe('hashIp', () => {
  it('liefert einen stabilen SHA-256-Hex', async () => {
    const a = await hashIp('203.0.113.7')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashIp('203.0.113.7')).toBe(a)
  })

  it('unterscheidet verschiedene Adressen', async () => {
    expect(await hashIp('203.0.113.7')).not.toBe(await hashIp('203.0.113.8'))
  })

  // Der Hash ist der Grund, warum keine IP gespeichert wird (F-01: kein Personenbezug)
  it('enthaelt die Adresse nicht im Klartext', async () => {
    expect(await hashIp('203.0.113.7')).not.toContain('203')
  })
})

describe('darfNoch', () => {
  it('laesst den fuenften Check durch', async () => {
    state.rateZeilen = RATE_GRENZE - 1
    await expect(darfNoch(db, 'H')).resolves.toBe(true)
  })

  it('blockt den sechsten', async () => {
    state.rateZeilen = RATE_GRENZE
    await expect(darfNoch(db, 'H')).resolves.toBe(false)
  })

  // Im Zweifel durchlassen waere die falsche Richtung: ein kaputter Zaehler
  // duerfte kein offenes Tor sein.
  it('blockt, wenn der Zaehler nicht lesbar ist', async () => {
    state.rateFehler = 'permission denied'
    await expect(darfNoch(db, 'H')).resolves.toBe(false)
  })
})

describe('loeseStandortAuf', () => {
  it('findet ueber die PLZ', async () => {
    state.plzTreffer = { plz: '48143', lat: 51.96, lng: 7.62, ort: 'Münster' }
    const r = await loeseStandortAuf(db, { plz: '48143' })
    expect(r).toEqual({ lat: 51.96, lng: 7.62, ort: 'Münster', plz: '48143' })
  })

  it('findet ueber den Ortsnamen, wenn keine PLZ da ist', async () => {
    state.ortTreffer = { plz: '48143', lat: 51.96, lng: 7.62, ort: 'Münster' }
    const r = await loeseStandortAuf(db, { ort: 'Münster' })
    expect(r?.ort).toBe('Münster')
  })

  /**
   * An den echten Daten gefunden (18.08.): `ort = 'Münster'` trifft **16
   * Zeilen** — jede Stadt hat mehrere Postleitzahlen. `.maybeSingle()` wirft
   * dann ("more than one row"), und die Ortssuche waere fuer praktisch jede
   * Stadt kaputt gewesen. Der Fake lieferte eine Zeile und war gruen.
   */
  it('kommt mit einem Ort zurecht, der mehrere Postleitzahlen hat', async () => {
    state.ortMehrfach = [
      { plz: '48143', lat: 51.96, lng: 7.62, ort: 'Münster' },
      { plz: '48145', lat: 51.97, lng: 7.63, ort: 'Münster' },
      { plz: '48147', lat: 51.98, lng: 7.64, ort: 'Münster' },
    ]
    const r = await loeseStandortAuf(db, { ort: 'Münster' })
    expect(r).not.toBeNull()
    expect(r?.plz).toBe('48143')     // die niedrigste, also zentrumsnah
  })

  // R-B: ein unbekannter Ort ist keine Koordinate 0,0
  it('gibt null zurueck, statt zu raten', async () => {
    await expect(loeseStandortAuf(db, { plz: '00000' })).resolves.toBeNull()
    await expect(loeseStandortAuf(db, {})).resolves.toBeNull()
  })
})

describe('legeCheckAn', () => {
  const basis = { modus: 'bestand' as const, ipHash: 'H', plz: '48143' }

  beforeEach(() => {
    state.plzTreffer = { plz: '48143', lat: 51.96, lng: 7.62, ort: 'Münster' }
  })

  it('legt den Check mit Token an und meldet ihn zurueck', async () => {
    const r = await legeCheckAn(db, basis)
    expect(r.ok).toBe(true)
    expect(r.ok && r.token).toMatch(/^[A-Za-z0-9_-]{32}$/)

    const check = state.inserts.find((i) => i.tabelle === 'levelup_checks')
    expect(check?.werte).toMatchObject({
      modus: 'bestand', status: 'neu', module_gewaehlt: [], module_gewuenscht: [],
      standort_lat: 51.96, standort_plz: '48143', ip_hash: 'H',
    })
  })

  it('schreibt das Ereignis modus_gewaehlt', async () => {
    await legeCheckAn(db, basis)
    const ev = state.inserts.find((i) => i.tabelle === 'levelup_events')
    expect(ev?.werte).toMatchObject({ typ: 'modus_gewaehlt' })
  })

  it('setzt gueltig_bis auf 90 Tage', async () => {
    await legeCheckAn(db, basis)
    const check = state.inserts.find((i) => i.tabelle === 'levelup_checks')
    const tage = (new Date(String(check?.werte.gueltig_bis)).getTime() - Date.now()) / 86_400_000
    expect(Math.round(tage)).toBe(90)
  })

  /** F-01: Weg A funktioniert ohne Website — eine kaputte URL ist kein Fehler. */
  it('verwirft eine unbrauchbare URL still, statt abzubrechen', async () => {
    const r = await legeCheckAn(db, { ...basis, websiteUrl: 'nicht-mal-fast-eine-url' })
    expect(r.ok).toBe(true)
    const check = state.inserts.find((i) => i.tabelle === 'levelup_checks')
    expect(check?.werte.website_url).toBeNull()
  })

  it('nimmt eine gueltige URL auf und ergaenzt das Schema', async () => {
    await legeCheckAn(db, { ...basis, websiteUrl: 'meyer-gutachten.de' })
    const check = state.inserts.find((i) => i.tabelle === 'levelup_checks')
    expect(check?.werte.website_url).toBe('https://meyer-gutachten.de')
  })

  it('bricht ab, wenn das Rate-Limit erreicht ist', async () => {
    state.rateZeilen = RATE_GRENZE
    const r = await legeCheckAn(db, basis)
    expect(r).toEqual({ ok: false, error: 'rate_limit' })
    expect(state.inserts.filter((i) => i.tabelle === 'levelup_checks')).toHaveLength(0)
  })

  it('bricht ab, wenn der Standort unbekannt ist', async () => {
    state.plzTreffer = null
    const r = await legeCheckAn(db, { ...basis, plz: '00000' })
    expect(r.ok).toBe(false)
  })

  it('meldet einen Insert-Fehler, statt einen Token zu behaupten', async () => {
    state.insertFehler = 'constraint verletzt'
    const r = await legeCheckAn(db, basis)
    expect(r.ok).toBe(false)
  })

  // R-M: der Check ist anonym, es entsteht KEIN Lead
  it('fasst sv_leads nicht an', async () => {
    await legeCheckAn(db, basis)
    expect(state.inserts.map((i) => i.tabelle)).not.toContain('sv_leads')
  })
})
