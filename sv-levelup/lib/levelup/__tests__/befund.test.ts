import { beforeEach, describe, expect, it } from 'vitest'
import { baueBefund } from '../befund'
import type { Check } from '../check'
import type { Db } from '../../anreicherung/schreiben'

const state = {
  check: null as Check | null,
  massnahmen: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
}

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'levelup_checks') {
      return {
        select: (spalten: string) => ({
          eq: () => ({
            maybeSingle: async () => ({
              // Die Tresor-Abfrage holt NUR massnahmen, der Rest ist der Check
              data: spalten === 'massnahmen'
                ? { massnahmen: state.massnahmen }
                : state.check,
              error: null,
            }),
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
    id: 'C1', token: 'T1', modus: 'bestand', status: 'fertig',
    website_url: 'https://x.de', gsc_freigabe_am: null,
    module_gewaehlt: ['web'], module_gewuenscht: ['web'],
    punkte_erhebbar: 100, score: 50, kein_score: false,
    befunde: {
      web: {
        istPunkte: 50, maxPunkte: 100,
        befunde: [{
          schluessel: 'https', label: 'Verschlüsselte Verbindung', wert: true,
          punkte: 50, maximum: 100, ampel: 'gelb',
          quelle: 'https://x.de', erhoben: '2026-08-19T10:00:00Z',
        }],
      },
    },
    fehlstellen: { web: [{ schluessel: 'lade', grund: 'Seite antwortete nicht' }] },
    standort_lat: 51.96, standort_lng: 7.62, standort_ort: 'Münster', standort_plz: '48143',
    erhoben_am: '2026-08-19T10:00:00Z', fehler_text: null, gueltig_bis: '2026-11-16T00:00:00Z',
    ...over,
  }
}

beforeEach(() => {
  state.check = check()
  state.massnahmen = []
  state.events = []
})

describe('baueBefund', () => {
  it('liefert Modus, Score und die Module', async () => {
    const r = await baueBefund(db, 'T1')

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.befund.modus).toBe('bestand')
    expect(r.befund.score).toBe(50)
    expect(r.befund.keinScore).toBe(false)
    expect(r.befund.module[0]).toMatchObject({ id: 'web', punkte: 50, maximum: 100 })
  })

  it('reicht Titel und Punkte je Modul aus der Registry durch', async () => {
    const r = await baueBefund(db, 'T1')
    expect(r.ok && r.befund.module[0].titel).toBe('Website — Technik & Recht')
  })

  it('liefert die Fehlstellen mit Grund mit', async () => {
    const r = await baueBefund(db, 'T1')
    expect(r.ok && r.befund.module[0].fehlstellen[0]).toMatchObject({
      schluessel: 'lade', grund: 'Seite antwortete nicht',
    })
  })

  it('behaelt Quelle und Erhebungszeitpunkt an jedem Befund (R-A)', async () => {
    const r = await baueBefund(db, 'T1')
    const b = r.ok ? r.befund.module[0].befunde[0] : null
    expect(b?.quelle).toBe('https://x.de')
    expect(b?.erhoben).toBe('2026-08-19T10:00:00Z')
  })

  /* ── R-E · DER SICHERHEITSTEST ─────────────────────────────────────────
   * Automatisiert, nicht von Hand. Das Feld wird NICHT ERZEUGT — nicht leer,
   * nicht null, nicht unscharf, auch keine Massnahmen-Ueberschriften.
   */
  it('liefert keine Massnahmen aus — auch keine Ueberschriften', async () => {
    state.massnahmen = [
      { t: 'Kategorie auf „Gutachter" umstellen', w: 'Alle sichtbaren Büros …', a: '30 min', ph: 1 },
      { t: '20 Fotos hochladen', w: 'Fahrzeuge in Begutachtung …', a: '2 h', ph: 1 },
    ]
    const r = await baueBefund(db, 'T1')
    const roh = JSON.stringify(r).toLowerCase()

    expect(roh).not.toContain('massnahme')
    expect(roh).not.toContain('maßnahme')
    expect(roh).not.toContain('empfehlung')
    expect(roh).not.toContain('handlungs')
    // und kein einziger Massnahmentext
    expect(roh).not.toContain('kategorie auf')
    expect(roh).not.toContain('fotos hochladen')
  })

  it('erzeugt das Feld nicht einmal leer', async () => {
    const r = await baueBefund(db, 'T1')
    expect(r.ok && 'massnahmen' in (r.befund as object)).toBe(false)
  })

  it('nennt im Tresor nur Anzahl, Phase und Aufwand', async () => {
    state.massnahmen = [
      { t: 'A', a: '30 min', ph: 1 },
      { t: 'B', a: '2 h', ph: 1 },
      { t: 'C', a: '90 min', ph: 2 },
    ]
    const r = await baueBefund(db, 'T1')
    if (!r.ok) throw new Error('unerwartet')

    expect(r.befund.tresor.anzahl).toBe(3)
    expect(r.befund.tresor.phasen).toEqual([
      { nr: 1, anzahl: 2, aufwand: '2,5 h' },
      { nr: 2, anzahl: 1, aufwand: '1,5 h' },
    ])
  })

  it('kommt mit einem leeren Tresor zurecht', async () => {
    const r = await baueBefund(db, 'T1')
    expect(r.ok && r.befund.tresor).toEqual({ anzahl: 0, phasen: [] })
  })

  it('schreibt das Ereignis tresor_gesehen', async () => {
    await baueBefund(db, 'T1')
    expect(state.events.map((e) => e.typ)).toContain('tresor_gesehen')
  })

  // F-05: „status muss fertig sein"
  it('lehnt einen Check ab, der noch laeuft', async () => {
    state.check = check({ status: 'laeuft' })
    const r = await baueBefund(db, 'T1')
    expect(r).toEqual({ ok: false, error: 'nicht_fertig' })
  })

  it('lehnt einen unbekannten Token ab', async () => {
    state.check = null
    const r = await baueBefund(db, 'WEG')
    expect(r).toEqual({ ok: false, error: 'unbekannt' })
  })

  it('lehnt einen abgelaufenen Check ab', async () => {
    state.check = check({ gueltig_bis: '2020-01-01T00:00:00Z' })
    const r = await baueBefund(db, 'T1')
    expect(r).toEqual({ ok: false, error: 'abgelaufen' })
  })

  // Design-Spec §3.2: relativ, unter der Haelfte der Gesamtpunkte
  it('gibt bei zu wenig erhebbaren Punkten keinen Score aus', async () => {
    state.check = check({ punkte_erhebbar: 30, score: null, kein_score: true })
    const r = await baueBefund(db, 'T1')

    expect(r.ok && r.befund.score).toBeNull()
    expect(r.ok && r.befund.keinScore).toBe(true)
  })

  /** Weg `aufbau` zeigt die Position, `bestand` den Gesamtscore (Welle 3 D). */
  it('nennt beim Weg aufbau die Position im Feld', async () => {
    state.check = check({
      modus: 'aufbau',
      module_gewaehlt: ['wett'],
      befunde: {
        wett: {
          istPunkte: 0, maxPunkte: 18,
          befunde: [{
            schluessel: 'rang', label: 'Position nach Bewertungszahl', wert: '61. von 61',
            punkte: 0, maximum: 8, ampel: 'rot', quelle: 'Places', erhoben: '2026-08-19T10:00:00Z',
          }],
        },
      },
    })
    const r = await baueBefund(db, 'T1')
    expect(r.ok && r.befund.position).toBe('61. von 61')
  })

  it('laesst die Position weg, wenn kein Rang gemessen wurde', async () => {
    const r = await baueBefund(db, 'T1')
    expect(r.ok && r.befund.position).toBeNull()
  })
})
