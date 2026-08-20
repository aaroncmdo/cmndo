import { describe, expect, it } from 'vitest'
import { DECKEL, entdecke } from '../lauf'
import type { Kachel } from '../kacheln'
import { PlacesFehler, type Betrieb, type PlacesAdapter } from '../../places'
import type { Db } from '../../anreicherung/schreiben'

/** Eine Kachel, die schon klein genug ist — ergibt genau eine Start-Kachel. */
const KLEIN: Kachel = { sued: 51.9, west: 7.5, nord: 52.0, ost: 7.7, tiefe: 0 }

function betrieb(n: number, lat = 51.95, lng = 7.6): Betrieb {
  return {
    placeId: `p${n}`, name: `Sachverständigenbüro Nummer${n}`, adresse: `Weg ${n}, 48143 Münster`,
    lat, lng, website: null, bewertung: null, bewertungen: null,
  }
}

function adapter(treffer: Betrieb[] | ((umkreis: { km: number }) => Betrieb[])): PlacesAdapter {
  return {
    suchText: async (_f, u) => (typeof treffer === 'function' ? treffer(u) : treffer),
    suchUmkreis: async () => [],
    details: async () => null,
    profil: async () => null,
    websiteVon: async () => null,
  }
}

function db() {
  const eingefuegt: Record<string, unknown>[] = []
  return {
    db: {
      from: () => ({
        insert: (w: Record<string, unknown>) => {
          eingefuegt.push(w)
          return { select: async () => ({ data: [{ id: 'x' }], error: null }) }
        },
        update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'x' }], error: null }) }) }),
      }),
    } as unknown as Db,
    eingefuegt,
  }
}

const BASIS = {
  gebiet: KLEIN, begriffe: ['Kfz-Sachverständiger'], maxTiefe: 2,
  schreiben: false, laufId: 'lauf-1', bestand: [], jetzt: () => 1000,
  // Die Drossel ist im Lauf echt — im Test injiziert, sonst wartet die Suite mit.
  warte: async () => {},
}

describe('entdecke', () => {
  it('zaehlt Funde und Abrufe', async () => {
    const { db: v } = db()
    const b = await entdecke({ ...BASIS, places: adapter([betrieb(1), betrieb(2)]), db: v })
    expect(b.kacheln).toBe(1)
    expect(b.abrufe).toBe(1)
    expect(b.eindeutig).toBe(2)
    expect(b.je.neu).toBe(2)
  })

  it('schreibt im Trockenlauf NICHTS', async () => {
    const { db: v, eingefuegt } = db()
    const b = await entdecke({ ...BASIS, places: adapter([betrieb(1)]), db: v })
    expect(b.je.neu).toBe(1)
    // ⚠ Der Lauf zaehlt, was passieren wuerde — er tut es nicht.
    expect(eingefuegt).toHaveLength(0)
  })

  it('schreibt scharf', async () => {
    const { db: v, eingefuegt } = db()
    await entdecke({ ...BASIS, schreiben: true, places: adapter([betrieb(1)]), db: v })
    expect(eingefuegt).toHaveLength(1)
    expect(eingefuegt[0].ist_aktiv).toBe(false)
  })

  it('zaehlt denselben Betrieb aus zwei Kacheln nur einmal', async () => {
    // ⚠ Die Kreise ueberlappen absichtlich (halbe Diagonale). Ohne diese
    // Merkliste zaehlte jeder Grenzbetrieb doppelt — und der Bericht laege
    // ueber der Wahrheit.
    const gross: Kachel = { sued: 51.0, west: 6.0, nord: 53.0, ost: 9.0, tiefe: 0 }
    const { db: v } = db()
    const b = await entdecke({ ...BASIS, gebiet: gross, places: adapter([betrieb(1)]), db: v })
    expect(b.kacheln).toBeGreaterThan(1)
    expect(b.eindeutig).toBe(1)
    expect(b.je.dublette_place_id).toBe(b.bruttoFunde - 1)
  })

  it('verfeinert eine gedeckelte Kachel', async () => {
    // Die Suche liefert das Maximum, solange die Kachel gross ist. KLEIN hat
    // rund 8,8 km Radius, geviertelt rund 4,4 — die Schwelle liegt dazwischen.
    const viele = Array.from({ length: DECKEL }, (_, i) => betrieb(i))
    const { db: v } = db()
    const b = await entdecke({
      ...BASIS, maxTiefe: 1,
      places: adapter((u) => (u.km > 6 ? viele : [betrieb(999)])),
      db: v,
    })
    expect(b.verfeinert).toBeGreaterThan(0)
    expect(b.kacheln).toBe(5)   // 1 + 4 geviertelte
  })

  it('nennt eine Kachel, die auch am Ende noch deckelt', async () => {
    // ⚠ Eine bekannte Luecke. Sie zu verschweigen hiesse, eine Vollerhebung
    // zu behaupten, die keine ist.
    const viele = Array.from({ length: DECKEL }, (_, i) => betrieb(i))
    const { db: v } = db()
    const b = await entdecke({ ...BASIS, maxTiefe: 0, places: adapter(viele), db: v })
    expect(b.gedeckeltAmEnde).toBe(1)
    expect(b.verfeinert).toBe(0)
  })

  it('laeuft nach einem Places-Fehler weiter', async () => {
    let ruf = 0
    const wackelig: PlacesAdapter = {
      suchText: async () => {
        ruf++
        if (ruf === 1) throw new PlacesFehler('OVER_QUERY_LIMIT')
        return [betrieb(1)]
      },
      suchUmkreis: async () => [], details: async () => null, profil: async () => null,
    websiteVon: async () => null,
    }
    const gross: Kachel = { sued: 51.0, west: 6.0, nord: 53.0, ost: 9.0, tiefe: 0 }
    const { db: v } = db()
    const b = await entdecke({ ...BASIS, gebiet: gross, places: wackelig, db: v })

    expect(b.fehler).toHaveLength(1)
    expect(b.fehler[0]).toContain('OVER_QUERY_LIMIT')
    expect(b.eindeutig).toBe(1)   // die uebrigen Kacheln liefen weiter
  })

  it('erkennt einen Betrieb aus dem Bestand', async () => {
    const { db: v } = db()
    const b = await entdecke({
      ...BASIS,
      bestand: [{ id: 'l1', firma: 'Sachverständigenbüro Nummer1', lat: 51.95, lng: 7.6, googlePlaceId: null }],
      places: adapter([betrieb(1)]),
      db: v,
    })
    expect(b.je.dublette_name).toBe(1)
    expect(b.je.neu).toBe(0)
  })

  it('legt denselben Betrieb im selben Lauf nicht zweimal an', async () => {
    // Zwei verschiedene Place-Kennungen, derselbe Betrieb am selben Ort —
    // ohne den wachsenden Bestand entstuenden zwei Leads.
    const zwilling: Betrieb = { ...betrieb(1), placeId: 'p-anders' }
    const { db: v, eingefuegt } = db()
    const b = await entdecke({
      ...BASIS, schreiben: true, places: adapter([betrieb(1), zwilling]), db: v,
    })
    expect(b.je.neu).toBe(1)
    expect(b.je.dublette_name).toBe(1)
    expect(eingefuegt).toHaveLength(1)
  })
})
