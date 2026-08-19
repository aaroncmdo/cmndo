import { beforeEach, describe, expect, it } from 'vitest'
import { messeCheck } from '../messmaschine'
import { befund, nichtErhoben, type Messfunktion, type MessRegistry } from '../modul-vertrag'
import type { Check } from '../check'
import type { Db } from '../../anreicherung/schreiben'
import type { PlacesAdapter } from '../../places'

const JETZT = '2026-08-18T20:00:00.000Z'

const state = {
  check: null as Check | null,
  updates: [] as Record<string, unknown>[],
  updateRows: 1,
  events: [] as Record<string, unknown>[],
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
    id: 'C1', token: 'T1', modus: 'bestand', status: 'laeuft',
    firmenname: null, sv_lead_id: null,
    website_url: 'https://x.de', gsc_freigabe_am: null,
    module_gewaehlt: ['web', 'verz'], module_gewuenscht: ['web', 'verz'],
    punkte_erhebbar: 24, score: null, kein_score: false,
    befunde: {}, fehlstellen: {},
    standort_lat: 51.96, standort_lng: 7.62, standort_ort: 'Münster', standort_plz: '48143',
    erhoben_am: null, fehler_text: null, gueltig_bis: '2026-11-16T00:00:00Z',
    ...over,
  }
}

/** Ein Modul, das sauber liefert. */
const gutesModul: Messfunktion = async (k) => ({
  befunde: [befund('a', 'A', true, 8, 12, 'https://x.de', k.jetzt())],
  fehlstellen: [],
})

const zweitesModul: Messfunktion = async (k) => ({
  befunde: [befund('b', 'B', true, 6, 12, 'https://x.de', k.jetzt())],
  fehlstellen: [],
})

const kaputtesModul: Messfunktion = async () => { throw new Error('Netz weg') }

const registry = (over: MessRegistry = {}): MessRegistry =>
  ({ web: gutesModul, verz: zweitesModul, ...over })

const opts = () => ({
  hole: async () => ({ status: 200, text: '' }),
  places: {} as PlacesAdapter,
  jetzt: () => JETZT,
  registry: registry(),
})

beforeEach(() => {
  state.check = check()
  state.updates = []
  state.updateRows = 1
  state.events = []
})

describe('messeCheck', () => {
  it('fuehrt die gewaehlten Module aus und summiert die Punkte', async () => {
    const r = await messeCheck(db, 'T1', opts())

    expect(r.ok).toBe(true)
    expect(r.ok && r.istPunkte).toBe(14)          // 8 + 6
    expect(r.ok && r.punkteErhebbar).toBe(24)     // 12 + 12
  })

  /**
   * ⚠ Der Nenner kommt aus dem, was GEMESSEN wurde — nicht aus dem, was
   * gewaehlt wurde.
   *
   * Am 19.08. im Durchlauf gefunden: Der Check trug `punkte_erhebbar: 116`
   * (Summe der gewaehlten Module), gemessen wurden aber nur 76 Punkte, weil
   * acht Module noch keine Messfunktion haben. Ergebnis: 54/116 = 47 % statt
   * 54/76 = 71 %. Der Sachverstaendige waere fuer Baulücken UNSERES Produkts
   * abgestraft worden — genau die Gleichsetzung „nicht gemessen = null
   * Punkte", die R-B verbietet. 435 gruene Tests fingen es nicht.
   */
  it('zaehlt Module OHNE Messfunktion nicht in den Nenner', async () => {
    state.check = check({
      punkte_erhebbar: 116,                         // die Schaetzung aus F-02
      module_gewaehlt: ['web', 'verz', 'ads', 'nach'],
    })
    // Nur `web` und `verz` koennen messen — `ads` und `nach` fehlen.
    const r = await messeCheck(db, 'T1', opts())

    expect(r.ok && r.punkteErhebbar).toBe(24)       // 12 + 12, NICHT 116
    const letzte = state.updates[state.updates.length - 1]
    expect(letzte.punkte_erhebbar).toBe(24)         // und so steht es auch in der DB
  })

  it('zaehlt nicht erhobene Kriterien nicht in den Nenner', async () => {
    state.check = check({ punkte_erhebbar: 100, module_gewaehlt: ['web'] })
    // Ein Modul, das die Haelfte seiner Kriterien nicht erheben konnte.
    const halb: Messfunktion = async (k) => ({
      befunde: [
        befund('a', 'A', true, 40, 80, 'https://x.de', k.jetzt()),
        nichtErhoben('b', 'B', 80, 'Die Seite baut ihre Inhalte erst im Browser auf.', 'https://x.de', k.jetzt()),
      ],
      fehlstellen: [],
    })
    const r = await messeCheck(db, 'T1', { ...opts(), registry: { web: halb } })

    // 80, nicht 160: was niemand gemessen hat, kann niemand erreichen.
    expect(r.ok && r.punkteErhebbar).toBe(80)
    expect(r.ok && r.score).toBe(50)                // 40 von 80
  })

  it('schreibt nach JEDEM Modul, damit der Fortschritt echt ist', async () => {
    await messeCheck(db, 'T1', opts())

    // zwei Zwischenstaende + der Abschluss
    expect(state.updates.length).toBeGreaterThanOrEqual(3)
    const ersteBefunde = state.updates[0].befunde as Record<string, unknown>
    expect(Object.keys(ersteBefunde)).toEqual(['web'])
  })

  it('legt die Befunde je Modul ab', async () => {
    await messeCheck(db, 'T1', opts())
    const letzte = state.updates[state.updates.length - 1]
    const b = letzte.befunde as Record<string, { istPunkte: number }>

    expect(Object.keys(b).sort()).toEqual(['verz', 'web'])
    expect(b.web.istPunkte).toBe(8)
  })

  it('setzt am Ende status=fertig mit Zeitstempel', async () => {
    await messeCheck(db, 'T1', opts())
    const letzte = state.updates[state.updates.length - 1]

    expect(letzte.status).toBe('fertig')
    expect(letzte.erhoben_am).toBe(JETZT)
  })

  /**
   * Ein Score entsteht erst ab 75 erhebbaren Punkten (Design-Spec §3.2:
   * relativ, die Haelfte der 150 Gesamtpunkte). Zwei Module reichen dafuer
   * NICHT — deshalb hier ein Lauf mit genug Gewicht.
   */
  it('rechnet den Score, wenn genug erhebbar war', async () => {
    state.check = check({ punkte_erhebbar: 100, module_gewaehlt: ['web'] })
    const schweresModul: Messfunktion = async (k) => ({
      befunde: [befund('a', 'A', true, 50, 100, 'https://x.de', k.jetzt())],
      fehlstellen: [],
    })
    await messeCheck(db, 'T1', { ...opts(), registry: { web: schweresModul } })

    const letzte = state.updates[state.updates.length - 1]
    expect(letzte.kein_score).toBe(false)
    expect(letzte.score).toBe(50)                 // round(50/100*100)
  })

  /**
   * Ein Modul darf den Lauf nicht beenden — sonst entscheidet ein einzelner
   * fremder Server darueber, ob der Nutzer ueberhaupt einen Befund bekommt.
   */
  it('laeuft nach einem Modulfehler weiter und macht eine Fehlstelle daraus', async () => {
    const r = await messeCheck(db, 'T1', {
      ...opts(), registry: registry({ web: kaputtesModul }),
    })

    expect(r.ok).toBe(true)
    expect(r.ok && r.istPunkte).toBe(6)           // nur das zweite Modul
    const letzte = state.updates[state.updates.length - 1]
    const f = letzte.fehlstellen as Record<string, { grund: string }[]>
    expect(f.web[0].grund).toContain('Netz weg')
  })

  it('behandelt ein Modul ohne Messfunktion als Fehlstelle, nicht als 0 Punkte', async () => {
    state.check = check({ module_gewaehlt: ['web', 'kwg'] })
    await messeCheck(db, 'T1', opts())

    const letzte = state.updates[state.updates.length - 1]
    const f = letzte.fehlstellen as Record<string, { grund: string }[]>
    expect(f.kwg[0].grund).toContain('noch nicht')
    const b = letzte.befunde as Record<string, unknown>
    expect(b.kwg).toBeUndefined()
  })

  // R-A/R-B werden VOR dem Speichern durchgesetzt
  it('verwirft einen Befund ohne Quelle und weist ihn als Fehlstelle aus', async () => {
    const ohneQuelle: Messfunktion = async (k) => ({
      befunde: [
        befund('gut', 'Gut', true, 5, 6, 'https://x.de', k.jetzt()),
        { schluessel: 'schlecht', label: 'Schlecht', wert: 1, punkte: 5, maximum: 6,
          ampel: 'gruen' as const, quelle: '', erhoben: k.jetzt() },
      ],
      fehlstellen: [],
    })
    const r = await messeCheck(db, 'T1', { ...opts(), registry: registry({ web: ohneQuelle }) })

    expect(r.ok && r.istPunkte).toBe(11)          // 5 (gut) + 6 (zweites Modul) -> nicht 16
    const letzte = state.updates[state.updates.length - 1]
    const f = letzte.fehlstellen as Record<string, { schluessel: string }[]>
    expect(f.web.some((x) => x.schluessel === 'schlecht')).toBe(true)
  })

  it('uebernimmt Fehlstellen, die das Modul selbst meldet', async () => {
    const mitFehlstelle: Messfunktion = async (k) => ({
      befunde: [nichtErhoben('x', 'X', 4, 'Seite antwortete nicht', 'https://x.de', k.jetzt())],
      fehlstellen: [{ schluessel: 'y', grund: 'robots.txt sperrt' }],
    })
    await messeCheck(db, 'T1', { ...opts(), registry: registry({ web: mitFehlstelle }) })

    const letzte = state.updates[state.updates.length - 1]
    const f = letzte.fehlstellen as Record<string, { grund: string }[]>
    expect(f.web.map((x) => x.grund)).toContain('robots.txt sperrt')
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await messeCheck(db, 'WEG', opts())
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })

  it('meldet einen wirkungslosen Abschluss-Write als Fehler', async () => {
    state.updateRows = 0
    const r = await messeCheck(db, 'T1', opts())
    expect(r.ok).toBe(false)
  })

  it('schreibt das Ereignis messung_beendet', async () => {
    await messeCheck(db, 'T1', opts())
    expect(state.events.map((e) => e.typ)).toContain('messung_beendet')
  })

  // Design-Spec §3.2: relativ, unter der Haelfte der Gesamtpunkte
  it('setzt kein_score, wenn zu wenig erhebbar war', async () => {
    state.check = check({ module_gewaehlt: ['verz'], punkte_erhebbar: 12 })
    await messeCheck(db, 'T1', { ...opts(), registry: registry({ verz: zweitesModul }) })

    const letzte = state.updates[state.updates.length - 1]
    expect(letzte.kein_score).toBe(true)
    expect(letzte.score).toBeNull()
  })
})
