import { beforeEach, describe, expect, it } from 'vitest'
import { leiteAb, phaseFuer } from '../massnahmen'
import { gibFrei } from '../freigabe'
import { baueBefund } from '../befund'
import type { Check } from '../check'
import type { Db } from '../../anreicherung/schreiben'
import type { Befund } from '../modul-vertrag'

const JETZT = '2026-08-19T10:00:00Z'

function b(over: Partial<Befund>): Befund {
  return {
    schluessel: 'impressum', label: 'Impressum verlinkt', wert: false,
    punkte: 0, maximum: 3, ampel: 'rot',
    quelle: 'https://x.de', erhoben: JETZT, ...over,
  }
}

const state = {
  check: null as Check | null,
  termin: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  massnahmen: [] as Record<string, unknown>[],
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'levelup_checks') {
      return {
        select: (spalten: string) => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: spalten === 'massnahmen' ? { massnahmen: state.massnahmen } : state.check,
              error: null,
            }),
          }),
        }),
        update: (w: Record<string, unknown>) => ({
          eq: () => ({
            select: async () => {
              state.updates.push(w)
              if (w.massnahmen) state.massnahmen = w.massnahmen as Record<string, unknown>[]
              return { data: [{ id: 'C1' }], error: null }
            },
          }),
        }),
      }
    }
    if (tabelle === 'levelup_termine') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.termin, error: null }) }) }) }
    }
    if (tabelle === 'levelup_events') {
      return { insert: async (w: Record<string, unknown>) => { state.events.push(w); return { error: null } } }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

function check(over: Partial<Check> = {}): Check {
  return {
    id: 'C1', token: 'T1', modus: 'bestand', status: 'fertig',
    firmenname: null, sv_lead_id: 'L1',
    website_url: 'https://x.de', gsc_freigabe_am: null,
    module_gewaehlt: ['web'], module_gewuenscht: ['web'],
    punkte_erhebbar: 100, score: 55, kein_score: false,
    befunde: {
      web: {
        istPunkte: 6, maxPunkte: 12,
        befunde: [
          b({ schluessel: 'impressum', punkte: 0, maximum: 3 }),
          b({ schluessel: 'https', label: 'Verschlüsselte Verbindung', wert: true, punkte: 3, maximum: 3, ampel: 'gruen' }),
          b({ schluessel: 'antwortzeit', label: 'Antwortzeit', wert: 3200, punkte: 0, maximum: 2, ampel: 'rot' }),
        ],
      },
    },
    fehlstellen: {},
    standort_lat: 51.96, standort_lng: 7.62, standort_ort: 'Münster', standort_plz: '48143',
    erhoben_am: JETZT, fehler_text: null, gueltig_bis: '2026-11-16T00:00:00Z',
    ...over,
  }
}

beforeEach(() => {
  state.check = check()
  state.termin = { id: 'TERMIN-1' }
  state.updates = []
  state.events = []
  state.massnahmen = []
})

describe('leiteAb', () => {
  it('erzeugt fuer einen Befund unter dem Maximum eine Massnahme', () => {
    const m = leiteAb({ web: { befunde: [b({})], istPunkte: 0, maxPunkte: 3 } })
    expect(m).toHaveLength(1)
    expect(m[0].t).toBeTruthy()
    expect(m[0].w).toBeTruthy()
  })

  it('erzeugt fuer einen Befund AUF dem Maximum keine', () => {
    const voll = b({ punkte: 3, maximum: 3, wert: true, ampel: 'gruen' })
    expect(leiteAb({ web: { befunde: [voll], istPunkte: 3, maxPunkte: 3 } })).toHaveLength(0)
  })

  /**
   * ⚠ Was nicht gemessen wurde, kann man nicht verbessern. Eine Massnahme zu
   * einem nicht erhobenen Befund waere eine Empfehlung ins Blaue — und
   * suggerierte, es sei etwas festgestellt worden (R-B).
   */
  it('erzeugt fuer einen NICHT ERHOBENEN Befund keine', () => {
    const offen = b({ wert: null, grund: 'per JavaScript nachgeladen', punkte: 0, ampel: 'offen' })
    expect(leiteAb({ web: { befunde: [offen], istPunkte: 0, maxPunkte: 3 } })).toHaveLength(0)
  })

  it('traegt an jeder Massnahme Quelle und erreichbare Punkte', () => {
    const m = leiteAb({ web: { befunde: [b({})], istPunkte: 0, maxPunkte: 3 } })
    expect(m[0].q).toContain('Impressum')
    expect(m[0].p).toBe(3)          // 3 - 0 erreichbare Punkte
  })

  it('rechnet die erreichbaren Punkte aus der Luecke', () => {
    const halb = b({ schluessel: 'antwortzeit', punkte: 1, maximum: 2 })
    const m = leiteAb({ web: { befunde: [halb], istPunkte: 1, maxPunkte: 2 } })
    expect(m[0].p).toBe(1)
  })

  it('kennt fuer die gebauten Kriterien einen konkreten Text', () => {
    const alle = ['impressum', 'datenschutz', 'https', 'antwortzeit', 'mobil']
    for (const s of alle) {
      const m = leiteAb({ web: { befunde: [b({ schluessel: s, punkte: 0, maximum: 3 })], istPunkte: 0, maxPunkte: 3 } })
      expect(m, `Kriterium ${s}`).toHaveLength(1)
      expect(m[0].t.length, `Titel fuer ${s}`).toBeGreaterThan(8)
    }
  })

  it('sortiert die Massnahmen nach Wirkung je Aufwand', () => {
    const m = leiteAb({
      web: {
        befunde: [
          b({ schluessel: 'antwortzeit', punkte: 0, maximum: 2 }),   // wenig Punkte, viel Aufwand
          b({ schluessel: 'impressum', punkte: 0, maximum: 3 }),     // mehr Punkte, wenig Aufwand
        ],
        istPunkte: 0, maxPunkte: 5,
      },
    })
    // `q` traegt das ausloesende Kriterium — das Impressum bringt mehr Punkte
    // bei weniger Aufwand und muss deshalb vorn stehen.
    expect(m[0].q).toContain('Impressum')
  })

  it('ueberspringt ein Kriterium ohne Vorlage, statt Unsinn zu erzeugen', () => {
    const unbekannt = b({ schluessel: 'gibtesnicht', punkte: 0, maximum: 5 })
    expect(leiteAb({ web: { befunde: [unbekannt], istPunkte: 0, maxPunkte: 5 } })).toHaveLength(0)
  })
})

describe('phaseFuer', () => {
  it('legt hohe Wirkung bei kleinem Aufwand in Phase 1', () => {
    expect(phaseFuer(3, 30)).toBe(1)
  })

  it('legt kleine Wirkung bei grossem Aufwand nach hinten', () => {
    expect(phaseFuer(1, 480)).toBe(3)
  })
})

describe('gibFrei', () => {
  /** F-09: „403, solange kein Termin existiert." Der Kern der ganzen Regel. */
  it('verweigert die Freigabe ohne Termin', async () => {
    state.termin = null
    const r = await gibFrei(db, 'T1')

    expect(r).toEqual({ ok: false, error: 'kein_termin' })
    expect(state.updates).toHaveLength(0)
  })

  it('liefert den Plan, sobald ein Termin existiert', async () => {
    const r = await gibFrei(db, 'T1')

    expect(r.ok).toBe(true)
    expect(r.ok && r.phasen.length).toBeGreaterThan(0)
    expect(r.ok && r.phasen[0].massnahmen.length).toBeGreaterThan(0)
  })

  it('speichert die Massnahmen am Check', async () => {
    await gibFrei(db, 'T1')
    expect(state.updates[0].massnahmen).toBeTruthy()
  })

  it('schreibt das Ereignis plan_gesendet', async () => {
    await gibFrei(db, 'T1')
    expect(state.events.map((e) => e.typ)).toContain('plan_gesendet')
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await gibFrei(db, 'WEG')
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })

  /**
   * ⚠ DER GEGENTEST ZU F-05: Auch NACH der Freigabe bleibt der Befund
   * massnahmenfrei. F-09 ist der einzige Weg — nicht ein zweiter neben einem
   * undichten F-05.
   */
  it('laesst F-05 auch nach der Freigabe dicht', async () => {
    await gibFrei(db, 'T1')
    expect(state.massnahmen.length).toBeGreaterThan(0)   // sie sind jetzt gespeichert

    const befund = await baueBefund(db, 'T1')
    const roh = JSON.stringify(befund).toLowerCase()

    expect(roh).not.toContain('massnahme')
    expect(roh).not.toContain('maßnahme')
    // und kein einziger Massnahmentext
    expect(roh).not.toContain('impressum verlinken')
  })
})
