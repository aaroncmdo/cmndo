import { beforeEach, describe, expect, it } from 'vitest'
import { speichereFunnel, jahreAlsZahl } from '../funnel'
import type { Check } from '../check'
import type { Db } from '../../anreicherung/schreiben'

const state = {
  check: null as Check | null,
  lead: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
  leadUpdates: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'levelup_checks') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.check, error: null }) }) }) }
    }
    if (tabelle === 'levelup_funnel') {
      return {
        upsert: async (w: Record<string, unknown>) => {
          state.upserts.push(w)
          return { error: null }
        },
      }
    }
    if (tabelle === 'sv_leads') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.lead, error: null }) }) }),
        update: (w: Record<string, unknown>) => ({
          eq: () => ({
            select: async () => {
              state.leadUpdates.push(w)
              return { data: [{ id: 'L1' }], error: null }
            },
          }),
        }),
      }
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
    website_url: null, gsc_freigabe_am: null,
    module_gewaehlt: [], module_gewuenscht: [],
    punkte_erhebbar: 100, score: 60, kein_score: false,
    befunde: {}, fehlstellen: {},
    standort_lat: 51.96, standort_lng: 7.62, standort_ort: 'Münster', standort_plz: '48143',
    erhoben_am: null, fehler_text: null, gueltig_bis: '2026-11-16T00:00:00Z',
    ...over,
  }
}

const antworten = {
  jahreErfahrung: 'über 10 Jahre',
  kiNutzung: 'noch gar nicht',
  marketingPartner: 'nein',
}

beforeEach(() => {
  state.check = check()
  state.lead = { id: 'L1', jahre_erfahrung: null }
  state.upserts = []
  state.leadUpdates = []
  state.events = []
})

describe('jahreAlsZahl', () => {
  /**
   * ⚠ `levelup_funnel.jahre_erfahrung` ist TEXT („über 10 Jahre"),
   * `sv_leads.jahre_erfahrung` ist INTEGER. Aus einer Spanne eine Zahl zu
   * machen ist Informationsverlust — genommen wird deshalb die UNTERE Grenze:
   * „über 10 Jahre" → 10 ist wahr (mindestens zehn), 15 wäre geraten.
   */
  it('nimmt die untere Grenze einer Spanne', () => {
    expect(jahreAlsZahl('über 10 Jahre')).toBe(10)
    expect(jahreAlsZahl('5-10 Jahre')).toBe(5)
    expect(jahreAlsZahl('2 bis 5 Jahre')).toBe(2)
  })

  it('liest eine einzelne Zahl', () => {
    expect(jahreAlsZahl('7')).toBe(7)
    expect(jahreAlsZahl('7 Jahre')).toBe(7)
  })

  it('gibt null zurueck, wenn keine Zahl drinsteht — statt zu raten', () => {
    expect(jahreAlsZahl('gerade erst angefangen')).toBeNull()
    expect(jahreAlsZahl('')).toBeNull()
    expect(jahreAlsZahl(null)).toBeNull()
  })

  it('verwirft unsinnige Werte', () => {
    expect(jahreAlsZahl('-3 Jahre')).toBeNull()
    expect(jahreAlsZahl('300 Jahre')).toBeNull()
  })
})

describe('speichereFunnel', () => {
  it('legt die Antworten am Check ab', async () => {
    const r = await speichereFunnel(db, 'T1', antworten)

    expect(r.ok).toBe(true)
    expect(state.upserts[0]).toMatchObject({
      check_id: 'C1',
      jahre_erfahrung: 'über 10 Jahre',
      ki_nutzung: 'noch gar nicht',
      marketing_partner: 'nein',
    })
    expect(state.upserts[0].beantwortet_am).toBeTruthy()
  })

  /** F-08: „Nur zulaessig, wenn sv_lead_id gesetzt ist — also nach F-06." */
  it('lehnt ab, solange kein Lead existiert', async () => {
    state.check = check({ sv_lead_id: null })
    const r = await speichereFunnel(db, 'T1', antworten)

    expect(r).toEqual({ ok: false, error: 'kein_lead' })
    expect(state.upserts).toHaveLength(0)
  })

  it('zieht die Jahre am Lead nach, wenn dort nichts steht', async () => {
    await speichereFunnel(db, 'T1', antworten)
    expect(state.leadUpdates[0]).toMatchObject({ jahre_erfahrung: 10 })
  })

  /** Dieselbe Regel wie in der Anreicherung: ein gefuelltes Feld bleibt. */
  it('ueberschreibt vorhandene Jahre NICHT', async () => {
    state.lead = { id: 'L1', jahre_erfahrung: 22 }
    await speichereFunnel(db, 'T1', antworten)
    expect(state.leadUpdates).toHaveLength(0)
  })

  it('zieht nichts nach, wenn keine Zahl ableitbar ist', async () => {
    await speichereFunnel(db, 'T1', { ...antworten, jahreErfahrung: 'lange schon' })
    expect(state.leadUpdates).toHaveLength(0)
  })

  it('kommt mit uebersprungenen Fragen zurecht', async () => {
    const r = await speichereFunnel(db, 'T1', {})
    expect(r.ok).toBe(true)
    expect(state.upserts[0]).toMatchObject({ jahre_erfahrung: null, ki_nutzung: null })
  })

  it('schreibt das Ereignis funnel_fertig', async () => {
    await speichereFunnel(db, 'T1', antworten)
    expect(state.events.map((e) => e.typ)).toContain('funnel_fertig')
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await speichereFunnel(db, 'WEG', antworten)
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })
})
