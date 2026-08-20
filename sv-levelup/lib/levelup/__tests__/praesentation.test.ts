import { describe, expect, it } from 'vitest'
import { erzeugePlanlink, pruefePlanlink, widerrufePlanlink } from '../praesentation'
import type { Db } from '../../anreicherung/schreiben'

const JETZT = new Date('2026-08-20T12:00:00.000Z')

type Zeile = {
  token: string
  check_id: string
  gueltig_bis: string
  widerrufen_am: string | null
  aufrufe?: number
}

/** Kleine Attrappe: eine Tabelle im Speicher, gefiltert nach den .eq()-Aufrufen. */
function db(zeilen: Zeile[]) {
  const eingefuegt: Record<string, unknown>[] = []
  const aktualisiert: Record<string, unknown>[] = []

  function kette(filter: Partial<Zeile>) {
    const treffer = () =>
      zeilen.filter((z) =>
        Object.entries(filter).every(([k, v]) => (z as Record<string, unknown>)[k] === v),
      )
    const api: Record<string, unknown> = {
      eq: (spalte: string, wert: unknown) => kette({ ...filter, [spalte]: wert } as Partial<Zeile>),
      is: (spalte: string, wert: unknown) => kette({ ...filter, [spalte]: wert } as Partial<Zeile>),
      gt: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: treffer()[0] ?? null, error: null }),
      select: () => api,
      single: async () => ({ data: treffer()[0] ?? null, error: null }),
    }
    return api
  }

  return {
    db: {
      from: () => ({
        select: () => kette({}),
        insert: (w: Record<string, unknown>) => {
          eingefuegt.push(w)
          return { select: () => ({ single: async () => ({ data: w, error: null }) }) }
        },
        update: (w: Record<string, unknown>) => {
          aktualisiert.push(w)
          return {
            eq: () => ({ select: async () => ({ data: [{ id: 'x' }], error: null }) }),
          }
        },
      }),
    } as unknown as Db,
    eingefuegt,
    aktualisiert,
  }
}

const GUELTIG: Zeile = {
  token: 'alt', check_id: 'c1',
  gueltig_bis: '2026-09-19T12:00:00.000Z', widerrufen_am: null, aufrufe: 3,
}

describe('erzeugePlanlink', () => {
  it('legt einen Link an, wenn es keinen gibt', async () => {
    const { db: v, eingefuegt } = db([])
    const r = await erzeugePlanlink(v, 'c1', 'u1', JETZT)
    expect(r.ok).toBe(true)
    expect(eingefuegt).toHaveLength(1)
    expect(String(eingefuegt[0].token)).toHaveLength(32)
    expect(eingefuegt[0].erstellt_von).toBe('u1')
  })

  it('gibt einen bestehenden gueltigen Link zurueck', async () => {
    const { db: v, eingefuegt } = db([GUELTIG])
    const r = await erzeugePlanlink(v, 'c1', 'u1', JETZT)
    expect(r.ok && r.token).toBe('alt')
    expect(eingefuegt).toHaveLength(0)
  })

  it('belebt einen WIDERRUFENEN Link nicht wieder', async () => {
    // ⚠ Der Unterschied zum Auswertungslink. Ein Widerruf, den ein erneuter
    // Klick aufhebt, ist keiner — es entsteht ein NEUER Token, und der alte
    // bleibt tot.
    const { db: v, eingefuegt } = db([{ ...GUELTIG, widerrufen_am: '2026-08-19T10:00:00.000Z' }])
    const r = await erzeugePlanlink(v, 'c1', 'u1', JETZT)
    expect(r.ok).toBe(true)
    expect(r.ok && r.token).not.toBe('alt')
    expect(eingefuegt).toHaveLength(1)
  })

  it('belebt einen ABGELAUFENEN Link nicht wieder', async () => {
    const { db: v, eingefuegt } = db([{ ...GUELTIG, gueltig_bis: '2026-08-01T12:00:00.000Z' }])
    const r = await erzeugePlanlink(v, 'c1', 'u1', JETZT)
    expect(r.ok && r.token).not.toBe('alt')
    expect(eingefuegt).toHaveLength(1)
  })
})

describe('pruefePlanlink', () => {
  it('laesst einen gueltigen Link durch', async () => {
    const { db: v } = db([GUELTIG])
    const r = await pruefePlanlink(v, 'alt', JETZT)
    expect(r).toEqual({ ok: true, checkId: 'c1', gueltigBis: GUELTIG.gueltig_bis, aufrufe: 3 })
  })

  it('weist einen unbekannten Token ab', async () => {
    const { db: v } = db([GUELTIG])
    const r = await pruefePlanlink(v, 'gibtsnicht', JETZT)
    expect(r).toEqual({ ok: false, grund: 'unbekannt' })
  })

  it('unterscheidet abgelaufen von widerrufen', async () => {
    // Der Grund steht im Text, den der Sachverstaendige liest: „abgelaufen"
    // laedt zum Nachfragen ein, „zurueckgezogen" nicht.
    const { db: a } = db([{ ...GUELTIG, gueltig_bis: '2026-08-01T12:00:00.000Z' }])
    expect(await pruefePlanlink(a, 'alt', JETZT)).toEqual({ ok: false, grund: 'abgelaufen' })

    const { db: w } = db([{ ...GUELTIG, widerrufen_am: '2026-08-19T10:00:00.000Z' }])
    expect(await pruefePlanlink(w, 'alt', JETZT)).toEqual({ ok: false, grund: 'widerrufen' })
  })

  it('nennt einen widerrufenen Link widerrufen, auch wenn er zusaetzlich abgelaufen ist', async () => {
    // Die aktivere Aussage gewinnt: jemand hat ihn zurueckgezogen.
    const { db: v } = db([{
      ...GUELTIG, gueltig_bis: '2026-08-01T12:00:00.000Z', widerrufen_am: '2026-08-05T10:00:00.000Z',
    }])
    expect(await pruefePlanlink(v, 'alt', JETZT)).toEqual({ ok: false, grund: 'widerrufen' })
  })
})

describe('widerrufePlanlink', () => {
  it('setzt nur den Zeitpunkt und loescht nichts', async () => {
    const { db: v, aktualisiert } = db([GUELTIG])
    const r = await widerrufePlanlink(v, 'alt', JETZT)
    expect(r.ok).toBe(true)
    expect(Object.keys(aktualisiert[0])).toEqual(['widerrufen_am'])
  })
})
