import { beforeEach, describe, expect, it } from 'vitest'
import { baueKontext, setzePruefumfang } from '../pruefumfang'
import { ladeCheck, type Check } from '../check'
import type { Db } from '../../anreicherung/schreiben'

const state = {
  check: null as Record<string, unknown> | null,
  ladeFehler: null as string | null,
  updates: [] as Record<string, unknown>[],
  updateRows: 1,
  events: [] as Record<string, unknown>[],
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'levelup_checks') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              state.ladeFehler
                ? { data: null, error: { message: state.ladeFehler } }
                : { data: state.check, error: null },
          }),
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
        insert: async (w: Record<string, unknown>) => {
          state.events.push(w)
          return { error: null }
        },
      }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

function check(over: Partial<Check> & Record<string, unknown> = {}): Check {
  return {
    id: 'C1', token: 'T1', modus: 'bestand' as const, status: 'neu' as const,
    website_url: null, gsc_freigabe_am: null,
    module_gewaehlt: [], module_gewuenscht: [],
    punkte_erhebbar: null, score: null, kein_score: false,
    befunde: {}, fehlstellen: {},
    standort_lat: 51.96, standort_lng: 7.62, standort_ort: 'Münster', standort_plz: '48143',
    erhoben_am: null, fehler_text: null, gueltig_bis: '2026-11-16T00:00:00Z',
    ...over,
  }
}

beforeEach(() => {
  state.check = check()
  state.ladeFehler = null
  state.updates = []
  state.updateRows = 1
  state.events = []
})

describe('ladeCheck', () => {
  it('liefert den Check zum Token', async () => {
    const r = await ladeCheck(db, 'T1')
    expect(r?.token).toBe('T1')
  })

  it('liefert null bei unbekanntem Token — kein Hinweis worauf', async () => {
    state.check = null
    await expect(ladeCheck(db, 'GIBTESNICHT')).resolves.toBeNull()
  })

  it('liefert null statt zu werfen, wenn die Abfrage scheitert', async () => {
    state.ladeFehler = 'permission denied'
    await expect(ladeCheck(db, 'T1')).resolves.toBeNull()
  })
})

describe('baueKontext', () => {
  it('leitet hatUrl aus website_url ab', () => {
    expect(baueKontext(check({ website_url: 'https://x.de' })).hatUrl).toBe(true)
    expect(baueKontext(check()).hatUrl).toBe(false)
    expect(baueKontext(check({ website_url: '   ' })).hatUrl).toBe(false)
  })

  it('leitet die GSC-Freigabe aus dem Zeitstempel ab', () => {
    expect(baueKontext(check()).hatGscFreigabe).toBe(false)
    expect(baueKontext(check({ gsc_freigabe_am: '2026-08-18T10:00:00Z' })).hatGscFreigabe).toBe(true)
  })

  it('uebernimmt den Modus', () => {
    expect(baueKontext(check({ modus: 'aufbau' })).modus).toBe('aufbau')
  })

  /**
   * Ohne diesen Test bliebe unbemerkt, wenn `systemFaehigkeiten()` den
   * Schluessel nicht mehr findet: die Places-Module waeren dann dauerhaft
   * gesperrt, der Check liefe trotzdem durch und lieferte einen Befund ohne
   * Wettbewerbsdaten — mit Sperrgrund, aber ohne dass jemand hinschaut.
   */
  it('haengt den Places-Zugang am Schluessel', () => {
    const vorher = process.env.GOOGLE_PLACES_API_KEY
    try {
      delete process.env.GOOGLE_PLACES_API_KEY
      expect(baueKontext(check()).hatPlacesZugang).toBe(false)

      process.env.GOOGLE_PLACES_API_KEY = 'AIza-test'
      expect(baueKontext(check()).hatPlacesZugang).toBe(true)
    } finally {
      if (vorher === undefined) delete process.env.GOOGLE_PLACES_API_KEY
      else process.env.GOOGLE_PLACES_API_KEY = vorher
    }
  })

  it('meldet Ads und Meta als fehlend, solange die Konten fehlen (A-6)', () => {
    const k = baueKontext(check())
    expect(k.hatAdsKonto).toBe(false)
    expect(k.hatMetaKonto).toBe(false)
  })
})

describe('setzePruefumfang', () => {
  /**
   * T-02, der laut Wellenplan kritische Test: „Der Wunsch des Nutzers wird
   * GETRENNT vom tatsaechlich Messbaren gespeichert. Wer ein Modul waehlt und
   * spaeter die URL nachtraegt, bekommt das Modul ZURUECK."
   */
  it('speichert den Wunsch getrennt vom Messbaren', async () => {
    const r = await setzePruefumfang(db, 'T1', ['web', 'verz'])   // ohne URL ist web gesperrt

    expect(r.ok && r.moduleAkzeptiert).toEqual(['verz'])
    expect(state.updates[0].module_gewuenscht).toEqual(['web', 'verz'])
    expect(state.updates[0].module_gewaehlt).toEqual(['verz'])
  })

  it('gibt das Modul ZURUECK, sobald die URL nachgetragen ist', async () => {
    state.check = check({ website_url: 'https://x.de', module_gewuenscht: ['web', 'verz'] })
    const r = await setzePruefumfang(db, 'T1', ['web', 'verz'])

    expect(r.ok && r.moduleAkzeptiert).toEqual(['web', 'verz'])
  })

  it('verwirft ein Modul, das der Client trotz Sperre schickt', async () => {
    state.check = check({ modus: 'aufbau' })          // gbp ist nur fuer bestand
    const r = await setzePruefumfang(db, 'T1', ['gbp', 'verz'])

    expect(r.ok && r.moduleAkzeptiert).toEqual(['verz'])
    expect(r.ok && r.moduleVerworfen[0]).toMatchObject({ id: 'gbp' })
    expect(r.ok && r.moduleVerworfen[0].grund).toContain('nicht vorgesehen')
  })

  it('verwirft eine erfundene Modul-Kennung', async () => {
    const r = await setzePruefumfang(db, 'T1', ['gibtesnicht', 'verz'])
    expect(r.ok && r.moduleAkzeptiert).toEqual(['verz'])
    expect(r.ok && r.moduleVerworfen[0]).toMatchObject({ id: 'gibtesnicht' })
  })

  it('lehnt eine leere Auswahl ab', async () => {
    const r = await setzePruefumfang(db, 'T1', [])
    expect(r).toEqual({ ok: false, error: 'kein_modul' })
    expect(state.updates).toHaveLength(0)
  })

  it('lehnt ab, wenn ALLE Module gesperrt sind — sonst laeuft ein leerer Check', async () => {
    state.check = check({ modus: 'aufbau' })
    const r = await setzePruefumfang(db, 'T1', ['gbp'])           // in aufbau gesperrt
    expect(r).toEqual({ ok: false, error: 'kein_modul_messbar' })
  })

  it('lehnt ab, wenn der Check nicht mehr neu ist', async () => {
    state.check = check({ status: 'laeuft' })
    const r = await setzePruefumfang(db, 'T1', ['verz'])
    expect(r.ok).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await setzePruefumfang(db, 'WEG', ['verz'])
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })

  it('rechnet punkteErhebbar aus den AKZEPTIERTEN Modulen', async () => {
    const r = await setzePruefumfang(db, 'T1', ['verz', 'nach'])   // 12 + 8
    expect(r.ok && r.punkteErhebbar).toBe(20)
    expect(state.updates[0].punkte_erhebbar).toBe(20)
  })

  it('zaehlt Module ohne Punktwertung mit 0', async () => {
    const r = await setzePruefumfang(db, 'T1', ['verz', 'nische'])  // 12 + 0
    expect(r.ok && r.punkteErhebbar).toBe(12)
  })

  it('schreibt das Ereignis mit Modulen und Verworfenen', async () => {
    await setzePruefumfang(db, 'T1', ['web', 'verz'])
    expect(state.events[0]).toMatchObject({ typ: 'umfang_bestaetigt' })
    const p = state.events[0].payload as { module: string[]; verworfen: unknown[] }
    expect(p.module).toEqual(['verz'])
    expect(p.verworfen).toHaveLength(1)
  })

  // Stiller Fehlschlag: ein 0-Row-Update unter RLS gibt keinen error
  it('meldet ein wirkungsloses Update als Fehler', async () => {
    state.updateRows = 0
    const r = await setzePruefumfang(db, 'T1', ['verz'])
    expect(r.ok).toBe(false)
    expect(state.events).toHaveLength(0)      // kein Ereignis ohne wirksamen Write
  })
})
