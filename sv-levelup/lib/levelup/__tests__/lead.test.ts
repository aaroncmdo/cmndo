import { beforeEach, describe, expect, it } from 'vitest'
import { istDublette, nameAusQuelle, entfernungKm } from '../dubletten'
import { findeOderLegeAn, WARTELISTE_NEU } from '../lead'
import type { Db } from '../../anreicherung/schreiben'

const state = {
  kandidaten: [] as Record<string, unknown>[],
  ladeFehler: null as string | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  updateRows: 1,
  insertFehler: null as string | null,
  angefasst: [] as string[],
}

const db = {
  from: (tabelle: string) => {
    state.angefasst.push(tabelle)
    if (tabelle === 'sv_leads') {
      return {
        select: () => ({
          gte: () => ({
            lte: () => ({
              gte: () => ({
                lte: async () =>
                  state.ladeFehler
                    ? { data: null, error: { message: state.ladeFehler } }
                    : { data: state.kandidaten, error: null },
              }),
            }),
          }),
        }),
        insert: (w: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              state.inserts.push(w)
              return state.insertFehler
                ? { data: null, error: { message: state.insertFehler } }
                : { data: { id: 'NEU-1', ...w }, error: null }
            },
          }),
        }),
        update: (w: Record<string, unknown>) => ({
          eq: () => ({
            select: async () => {
              state.updates.push(w)
              return {
                data: Array.from({ length: state.updateRows }, () => ({ id: 'L1' })),
                error: null,
              }
            },
          }),
        }),
      }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

const MUENSTER = { lat: 51.9607, lng: 7.6261 }

function lead(over: Record<string, unknown> = {}) {
  return {
    id: 'L1', name: 'Sachverständigenbüro Meyer', firma: 'Sachverständigenbüro Meyer',
    plz: '48143', ort: 'Münster', lat: MUENSTER.lat, lng: MUENSTER.lng,
    telefon: null, email: null, website_url: null, ...over,
  }
}

beforeEach(() => {
  state.kandidaten = []
  state.ladeFehler = null
  state.inserts = []
  state.updates = []
  state.updateRows = 1
  state.insertFehler = null
  state.angefasst = []
})

describe('entfernungKm', () => {
  it('misst kurze Strecken brauchbar', () => {
    // Münster Zentrum -> Münster Hafen, gut 1 km
    expect(entfernungKm(51.9607, 7.6261, 51.9530, 7.6350)).toBeCloseTo(1.1, 0)
  })

  it('misst lange Strecken brauchbar', () => {
    // Münster -> Köln: rund 123 km LUFTLINIE. (Die oft genannten ~145 km sind
    // die Straßenentfernung — hier zählt die Luftlinie.)
    const d = entfernungKm(51.9607, 7.6261, 50.9375, 6.9603)
    expect(d).toBeGreaterThan(118)
    expect(d).toBeLessThan(128)
  })

  it('ist bei identischen Punkten null', () => {
    expect(entfernungKm(51.9607, 7.6261, 51.9607, 7.6261)).toBe(0)
  })
})

describe('nameAusQuelle', () => {
  it('nimmt die Firma, wenn es eine gibt', () => {
    expect(nameAusQuelle('Kfz-Gutachter Meyer', 'https://x.de', 'Münster')).toBe('Kfz-Gutachter Meyer')
  })

  /** F-06 Schritt 4: „name aus Firma ODER Domain". */
  it('leitet aus der Domain ab, wenn die Firma fehlt', () => {
    expect(nameAusQuelle(null, 'https://sv-bergk.de', 'Münster')).toBe('sv-bergk.de')
    expect(nameAusQuelle(null, 'https://www.gutachter-yigit.com/pfad', 'Münster')).toBe('gutachter-yigit.com')
  })

  /**
   * ⚠ `sv_leads.name` ist NOT NULL. Ohne Firma und ohne Domain braucht es
   * trotzdem einen Wert — und der soll die Unkenntnis ZEIGEN, statt einen
   * Namen zu erfinden (R-B).
   */
  it('macht die Unkenntnis sichtbar, statt einen Namen zu erfinden', () => {
    expect(nameAusQuelle(null, null, 'Münster')).toBe('Unbenannt (Münster)')
    expect(nameAusQuelle(null, null, null)).toBe('Unbenannt')
  })
})

describe('istDublette', () => {
  const a = { firma: 'Kfz-Sachverständigenbüro Meyer GmbH', ...MUENSTER }

  it('erkennt denselben Betrieb trotz verschiedener Gattungswoerter', () => {
    expect(istDublette(a, { firma: 'Gutachter Meyer', lat: 51.97, lng: 7.63 })).toBe(true)
  })

  it('erkennt ihn trotz Umlaut-Schreibweise', () => {
    expect(istDublette(a, { firma: 'Sachverstaendigenbuero Meyer', lat: 51.97, lng: 7.63 })).toBe(true)
  })

  it('haelt zwei gleichnamige Betriebe in verschiedenen Staedten auseinander', () => {
    // Berlin, rund 400 km entfernt
    expect(istDublette(a, { firma: 'Sachverständigenbüro Meyer', lat: 52.53, lng: 13.38 })).toBe(false)
  })

  it('haelt zwei verschiedene Betriebe am selben Ort auseinander', () => {
    expect(istDublette(a, { firma: 'Sachverständigenbüro Schmitz', ...MUENSTER })).toBe(false)
  })

  /**
   * ⚠ Dieselbe Fehlerklasse zum DRITTEN Mal: `''.includes('')` ist true. Ein
   * Betrieb, dessen Name nur aus Gattungswoertern besteht, hat einen LEEREN
   * Kern — ohne Mindestlaenge waeren zwei namenlose Betriebe „dieselben" und
   * der zweite bekaeme den Lead des ersten.
   */
  it('haelt zwei Betriebe mit leerem Namenskern NICHT fuer dieselben', () => {
    expect(istDublette(
      { firma: 'Sachverständigenbüro', ...MUENSTER },
      { firma: 'Kfz-Gutachter', ...MUENSTER },
    )).toBe(false)
  })

  it('greift genau bis 10 km', () => {
    // rund 8 km noerdlich -> noch Dublette
    expect(istDublette(a, { firma: 'Meyer', lat: 52.033, lng: 7.6261 })).toBe(true)
    // rund 22 km noerdlich -> nicht mehr
    expect(istDublette(a, { firma: 'Meyer', lat: 52.158, lng: 7.6261 })).toBe(false)
  })
})

describe('findeOderLegeAn', () => {
  const eingabe = {
    firma: 'Sachverständigenbüro Meyer', plz: '48143', ort: 'Münster',
    ...MUENSTER, telefon: '+49251123456', websiteUrl: 'https://meyer.de',
  }

  it('legt einen neuen Lead an, wenn nichts passt', async () => {
    const r = await findeOderLegeAn(db, eingabe)

    expect(r.ok && r.neu).toBe(true)
    expect(state.inserts[0]).toMatchObject({
      name: 'Sachverständigenbüro Meyer', quelle: 'sv-levelup',
      plz: '48143', ort: 'Münster', ist_aktiv: true,
    })
  })

  /**
   * ⚠ CONTRACT F-06 verlangt `warteliste_status='neu'` — der CHECK erlaubt aber
   * nur ausstehend|kontaktiert|aktiv|abgelehnt (geprüft 19.08.). Mit 'neu'
   * hätte Postgres JEDEN ersten Lead abgewiesen.
   */
  it('setzt einen Warteliste-Status, den der CHECK zulaesst', async () => {
    await findeOderLegeAn(db, eingabe)
    expect(state.inserts[0].warteliste_status).toBe(WARTELISTE_NEU)
    expect(['ausstehend', 'kontaktiert', 'aktiv', 'abgelehnt']).toContain(WARTELISTE_NEU)
  })

  it('fuellt die Pflichtfelder, die keinen Vorgabewert haben', async () => {
    await findeOderLegeAn(db, eingabe)
    const i = state.inserts[0]
    for (const feld of ['name', 'adresse', 'lat', 'lng']) {
      expect(i[feld]).toBeTruthy()
    }
    expect(i.adresse).toBe('48143 Münster')
  })

  it('verknuepft einen Bestandslead, statt einen zweiten anzulegen', async () => {
    state.kandidaten = [lead()]
    const r = await findeOderLegeAn(db, eingabe)

    expect(r.ok && r.neu).toBe(false)
    expect(r.ok && r.leadId).toBe('L1')
    expect(state.inserts).toHaveLength(0)
  })

  it('ergaenzt beim Bestandslead nur LEERE Felder', async () => {
    state.kandidaten = [lead({ telefon: '+49999999999', email: 'alt@b.de' })]
    await findeOderLegeAn(db, eingabe)

    expect(state.updates[0]).not.toHaveProperty('telefon')   // war belegt
    expect(state.updates[0]).toHaveProperty('website_url')   // war leer
  })

  it('meldet einen wirkungslosen Update als Fehler', async () => {
    state.kandidaten = [lead()]
    state.updateRows = 0
    const r = await findeOderLegeAn(db, eingabe)
    expect(r.ok).toBe(false)
  })

  it('meldet einen Insert-Fehler, statt eine Lead-Id zu behaupten', async () => {
    state.insertFehler = 'constraint verletzt'
    const r = await findeOderLegeAn(db, eingabe)
    expect(r.ok).toBe(false)
  })

  /** R-M: Der Vertriebs-Lead geht in sv_leads — nie in die Schadenfall-Tabellen. */
  it('fasst weder leads noch partner_leads an', async () => {
    await findeOderLegeAn(db, eingabe)
    expect(state.angefasst).not.toContain('leads')
    expect(state.angefasst).not.toContain('partner_leads')
  })

  it('bricht ab, wenn die Kandidaten nicht lesbar sind — statt blind anzulegen', async () => {
    state.ladeFehler = 'permission denied'
    const r = await findeOderLegeAn(db, eingabe)
    expect(r.ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })
})
