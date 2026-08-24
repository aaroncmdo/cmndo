import { beforeEach, describe, expect, it } from 'vitest'
import { starteMessung, holeFortschritt, ZEITGRENZE_MIN } from '../messung'
import type { Check } from '../check'
import type { Db } from '../../anreicherung/schreiben'

const JETZT = new Date('2026-08-19T12:00:00.000Z')

const state = {
  check: null as Check | null,
  updates: [] as Record<string, unknown>[],
  updateRows: 1,
  events: [] as Record<string, unknown>[],
  gestartet: 0,
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'levelup_checks') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: state.check, error: null }) }),
        }),
        update: (w: Record<string, unknown>) => ({
          eq: () => ({
            select: async () => {
              state.updates.push(w)
              return {
                data: Array.from({ length: state.updateRows }, () => ({ id: 'C1' })),
                error: null,
              }
            },
          }),
        }),
      }
    }
    if (tabelle === 'levelup_events') {
      return {
        insert: async (w: Record<string, unknown>) => { state.events.push(w); return { error: null } },
      }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

function check(over: Partial<Check> = {}): Check {
  return {
    id: 'C1', token: 'T1', modus: 'bestand', status: 'neu',
    firmenname: null, sv_lead_id: null,
    website_url: 'https://x.de', gsc_freigabe_am: null,
    module_gewaehlt: ['web', 'verz', 'wett'], module_gewuenscht: ['web', 'verz', 'wett'],
    punkte_erhebbar: 42, score: null, kein_score: false,
    befunde: {}, fehlstellen: {},
    standort_lat: 51.96, standort_lng: 7.62, standort_ort: 'Münster', standort_plz: '48143',
    erhoben_am: null, fehler_text: null, gueltig_bis: '2026-11-16T00:00:00Z',
    ...over,
  }
}

const opts = () => ({
  jetzt: () => JETZT,
  starte: async () => { state.gestartet += 1 },
})

beforeEach(() => {
  state.check = check()
  state.updates = []
  state.updateRows = 1
  state.events = []
  state.gestartet = 0
})

describe('starteMessung', () => {
  it('setzt den Status auf laeuft und stoesst die Messung an', async () => {
    const r = await starteMessung(db, 'T1', opts())

    expect(r).toEqual({ ok: true, status: 'laeuft' })
    expect(state.updates[0]).toMatchObject({ status: 'laeuft' })
    expect(state.gestartet).toBe(1)
  })

  it('schreibt das Ereignis messung_gestartet', async () => {
    await starteMessung(db, 'T1', opts())
    expect(state.events.map((e) => e.typ)).toContain('messung_gestartet')
  })

  /**
   * F-03: „Idempotent: zweiter Aufruf bei status='laeuft' gibt denselben Zustand
   * zurueck, startet nichts neu." Ein Doppelklick oder ein wiederholtes
   * Neuladen darf die Messung nicht doppelt laufen lassen — das kostet echtes
   * Geld bei den Places-Abfragen.
   */
  it('startet bei laufender Messung NICHTS neu', async () => {
    state.check = check({ status: 'laeuft', erstellt: JETZT.toISOString() } as Partial<Check>)
    const r = await starteMessung(db, 'T1', opts())

    expect(r).toEqual({ ok: true, status: 'laeuft' })
    expect(state.gestartet).toBe(0)
    expect(state.updates).toHaveLength(0)
  })

  it('gibt bei einem fertigen Check dessen Zustand zurueck, ohne neu zu messen', async () => {
    state.check = check({ status: 'fertig' })
    const r = await starteMessung(db, 'T1', opts())

    expect(r).toEqual({ ok: true, status: 'fertig' })
    expect(state.gestartet).toBe(0)
  })

  it('lehnt einen Check ohne gewaehlte Module ab', async () => {
    state.check = check({ module_gewaehlt: [] })
    const r = await starteMessung(db, 'T1', opts())

    expect(r.ok).toBe(false)
    expect(state.gestartet).toBe(0)
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await starteMessung(db, 'WEG', opts())
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })

  it('stoesst die Messung NICHT an, wenn der Status-Write wirkungslos war', async () => {
    state.updateRows = 0
    const r = await starteMessung(db, 'T1', opts())

    expect(r.ok).toBe(false)
    expect(state.gestartet).toBe(0)
  })
})

describe('holeFortschritt', () => {
  it('meldet alle Module als wartend, solange nichts vorliegt', async () => {
    state.check = check({ status: 'laeuft' })
    const r = await holeFortschritt(db, 'T1', opts())

    expect(r.ok && r.status).toBe('laeuft')
    expect(r.ok && r.module).toEqual([
      { id: 'web', zustand: 'wartet' },
      { id: 'verz', zustand: 'wartet' },
      { id: 'wett', zustand: 'wartet' },
    ])
  })

  it('leitet fertig aus vorhandenen Befunden ab', async () => {
    state.check = check({ status: 'laeuft', befunde: { web: { befunde: [], istPunkte: 8, maxPunkte: 12 } } })
    const r = await holeFortschritt(db, 'T1', opts())

    expect(r.ok && r.module[0]).toEqual({ id: 'web', zustand: 'fertig' })
    expect(r.ok && r.module[1]).toEqual({ id: 'verz', zustand: 'wartet' })
  })

  it('leitet fehler aus einer Fehlstelle ohne Befund ab', async () => {
    state.check = check({ status: 'laeuft', fehlstellen: { wett: [{ schluessel: 'wett', grund: 'x' }] } })
    const r = await holeFortschritt(db, 'T1', opts())

    expect(r.ok && r.module.find((m) => m.id === 'wett')).toEqual({ id: 'wett', zustand: 'fehler' })
  })

  it('meldet fertig, wenn Befunde UND Fehlstellen vorliegen', async () => {
    state.check = check({
      status: 'laeuft',
      befunde: { web: { befunde: [], istPunkte: 8, maxPunkte: 12 } },
      fehlstellen: { web: [{ schluessel: 'lade', grund: 'einzelnes Kriterium fehlt' }] },
    })
    const r = await holeFortschritt(db, 'T1', opts())

    // Ein Modul mit Teilergebnis ist fertig, nicht fehlerhaft
    expect(r.ok && r.module[0].zustand).toBe('fertig')
  })

  /**
   * F-04: „Keine Befunddaten in dieser Antwort." Der Fortschritt wird alle zwei
   * Sekunden abgefragt — er darf den Befund nicht vorab ausliefern und schon
   * gar nicht die Massnahmen.
   */
  it('enthaelt keine Befunddaten', async () => {
    state.check = check({
      status: 'laeuft',
      befunde: { web: { befunde: [{ schluessel: 'https', quelle: 'https://geheim.de' }], istPunkte: 8, maxPunkte: 12 }},
    })
    const r = await holeFortschritt(db, 'T1', opts())
    const roh = JSON.stringify(r)

    expect(roh).not.toContain('geheim')
    expect(roh).not.toContain('quelle')
    expect(roh).not.toContain('istPunkte')
    expect(roh).not.toContain('massnahme')
  })

  /**
   * F-03: „Zeitgrenze 10 Minuten → status='fehler', fehler_text gesetzt."
   * Ohne das bleibt ein abgebrochener Lauf fuer immer auf „laeuft" und die
   * Pruefliste dreht sich endlos.
   */
  it('setzt einen haengenden Lauf nach der Zeitgrenze auf fehler', async () => {
    const zuAlt = new Date(JETZT.getTime() - (ZEITGRENZE_MIN + 1) * 60_000).toISOString()
    state.check = check({ status: 'laeuft', aktualisiert_am: zuAlt } as Partial<Check>)

    const r = await holeFortschritt(db, 'T1', opts())

    expect(r.ok && r.status).toBe('fehler')
    expect(state.updates[0]).toMatchObject({ status: 'fehler' })
    expect(String(state.updates[0].fehler_text)).toContain('Zeitgrenze')
  })

  it('laesst einen frischen Lauf in Ruhe', async () => {
    const frisch = new Date(JETZT.getTime() - 60_000).toISOString()
    state.check = check({ status: 'laeuft', aktualisiert_am: frisch } as Partial<Check>)

    const r = await holeFortschritt(db, 'T1', opts())

    expect(r.ok && r.status).toBe('laeuft')
    expect(state.updates).toHaveLength(0)
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await holeFortschritt(db, 'WEG', opts())
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })
})
