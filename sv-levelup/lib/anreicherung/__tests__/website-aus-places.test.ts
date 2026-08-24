import { describe, expect, it, vi } from 'vitest'
import { PlacesFehler, type PlacesAdapter } from '../../places'
import type { Db } from '../schreiben'
import {
  PLACES_SICHERHEIT,
  PLACES_ZUORDNUNG,
  baueFund,
  holeWebsitesAusPlaces,
  placeQuelleUrl,
} from '../website-aus-places'

function adapter(antwort: (placeId: string) => string | null | Promise<string | null>): PlacesAdapter {
  return {
    suchText: async () => [],
    suchUmkreis: async () => [],
    details: async () => null,
    profil: async () => null,
    websiteVon: async (id) => antwort(id),
  }
}

type Zustand = {
  kandidaten: Array<{ id: string; firma: string | null; name: string; ort: string | null; google_place_id: string }>
  ladeFehler: string | null
  updates: Array<{ id: string; werte: Record<string, unknown> }>
  audit: Record<string, unknown>[]
}

function db(z: Zustand): Db {
  return {
    from: (tabelle: string) => {
      if (tabelle === 'levelup_anreicherung') {
        return { insert: async (w: Record<string, unknown>[]) => { z.audit.push(...w); return { error: null } } }
      }
      if (tabelle === 'cold_mail_suppression') {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) }
      }
      // sv_leads
      let bereich: [number, number] | null = null
      const kette: Record<string, unknown> = {}
      for (const m of ['not', 'is', 'eq', 'gt', 'order']) kette[m] = () => kette
      kette.range = (von: number, bis: number) => { bereich = [von, bis]; return kette }
      kette.then = (aufl: (w: unknown) => void) =>
        aufl(
          z.ladeFehler
            ? { data: null, error: { message: z.ladeFehler } }
            : { data: bereich ? z.kandidaten.slice(bereich[0], bereich[1] + 1) : z.kandidaten, error: null },
        )

      return {
        select: (spalten: string) => {
          // Der Einzel-Lead-Read von schreibeFunde (Ist-Zustand) vs. die Kandidatenliste.
          if (spalten.includes('nachname')) {
            return {
              eq: () => ({
                single: async () => ({
                  data: { id: 'L1', email: null, telefon: null, website_url: null, vorname: null, nachname: null },
                  error: null,
                }),
              }),
            }
          }
          return kette
        },
        update: (werte: Record<string, unknown>) => ({
          eq: (_s: string, id: string) => ({
            select: async () => { z.updates.push({ id, werte }); return { data: [{ id }], error: null } },
          }),
        }),
      }
    },
  } as unknown as Db
}

function zustand(over: Partial<Zustand> = {}): Zustand {
  return {
    kandidaten: [{ id: 'L1', firma: 'Sachverständigenbüro Meyer', name: 'Meyer', ort: 'Münster', google_place_id: 'p1' }],
    ladeFehler: null, updates: [], audit: [], ...over,
  }
}

const basis = { laufId: 'LAUF1', dryRun: false, warte: async () => {} }

describe('placeQuelleUrl / baueFund', () => {
  it('nennt den offiziellen Verweis auf den Place als Herkunft', () => {
    expect(placeQuelleUrl('ChIJ123')).toBe('https://www.google.com/maps/place/?q=place_id:ChIJ123')
  })

  it('traegt die Methode „verzeichnis" — Google Maps IST ein Verzeichnis', () => {
    // ⚠ Kein neuer Methodenname, keine Migration: der vorhandene Wert passt.
    const f = baueFund('p1', 'https://meyer.de')
    expect(f.methode).toBe('verzeichnis')
    expect(f.feld).toBe('website_url')
  })

  it('trennt Zuordnung und Belastbarkeit', () => {
    // ⭐ Die Place-Kennung IST der Betrieb — an der Zuordnung gibt es keinen
    // Zweifel (100). Der WERT stammt aus der Selbstauskunft und kann veraltet
    // sein (95). Beim Domain-Raten ist genau die Zuordnung die offene Frage.
    const f = baueFund('p1', 'https://meyer.de')
    expect(f.zuordnung).toBe(PLACES_ZUORDNUNG)
    expect(f.sicherheit).toBe(PLACES_SICHERHEIT)
    expect(f.zuordnung).toBeGreaterThan(f.sicherheit)
  })
})

describe('holeWebsitesAusPlaces', () => {
  it('schreibt die gefundene Website an den Lead', async () => {
    const z = zustand()
    const r = await holeWebsitesAusPlaces({
      ...basis, db: db(z), places: adapter(() => 'https://meyer.de'),
    })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unerwartet')
    expect(r.bericht.gefunden).toBe(1)
    expect(r.bericht.geschrieben).toBe(1)
    expect(z.updates[0].werte).toMatchObject({
      website_url: 'https://meyer.de',
      website_gefunden: 'verzeichnis',
      website_sicherheit: PLACES_SICHERHEIT,
    })
  })

  it('zaehlt „keine Website im Profil" als ERGEBNIS, nicht als Fehler', async () => {
    // ⚠ Viele kleine Bueros haben schlicht keine Website — und genau das ist
    // ein Befund, den der Vertrieb braucht. Als Fehler gezaehlt saehe der Lauf
    // kaputt aus, obwohl er sauber gearbeitet hat.
    const z = zustand()
    const r = await holeWebsitesAusPlaces({ ...basis, db: db(z), places: adapter(() => null) })

    expect(r.ok && r.bericht.ohneWebsite).toBe(1)
    expect(r.ok && r.bericht.fehler).toHaveLength(0)
    expect(z.updates).toHaveLength(0)
  })

  it('laeuft nach einem Ausfall WEITER', async () => {
    // ⚠ Sonst entscheidet ein einzelner fremder Fehler ueber siebentausend
    // Abrufe — und man faengt von vorn an.
    const z = zustand({
      kandidaten: [
        { id: 'L1', firma: 'A', name: 'A', ort: 'X', google_place_id: 'p1' },
        { id: 'L2', firma: 'B', name: 'B', ort: 'Y', google_place_id: 'p2' },
      ],
    })
    const r = await holeWebsitesAusPlaces({
      ...basis, db: db(z),
      places: adapter((id) => {
        if (id === 'p1') throw new PlacesFehler('NETZ', 'weg')
        return 'https://b.de'
      }),
    })

    expect(r.ok && r.bericht.betrachtet).toBe(2)
    expect(r.ok && r.bericht.fehler).toHaveLength(1)
    expect(r.ok && r.bericht.gefunden).toBe(1)
  })

  it('haelt die letzte Kennung fest — damit ein Abbruch fortsetzbar ist', async () => {
    const z = zustand({
      kandidaten: [
        { id: 'L1', firma: 'A', name: 'A', ort: 'X', google_place_id: 'p1' },
        { id: 'L2', firma: 'B', name: 'B', ort: 'Y', google_place_id: 'p2' },
      ],
    })
    const r = await holeWebsitesAusPlaces({ ...basis, db: db(z), places: adapter(() => 'https://x.de') })
    expect(r.ok && r.bericht.letzteId).toBe('L2')
  })

  it('schreibt im Trockenlauf NICHTS', async () => {
    const z = zustand()
    const r = await holeWebsitesAusPlaces({
      ...basis, dryRun: true, db: db(z), places: adapter(() => 'https://meyer.de'),
    })

    expect(r.ok && r.bericht.gefunden).toBe(1)
    expect(z.updates).toHaveLength(0)
  })

  it('sammelt eine STICHPROBE der Werte, nicht nur Zahlen', async () => {
    // ⭐ P2s teuerste Lehre: ein Lauf, der bloss zaehlt, zeigt die Fehlerklasse
    // „Wert vorhanden, Wert unbrauchbar" nicht.
    const z = zustand()
    const r = await holeWebsitesAusPlaces({ ...basis, db: db(z), places: adapter(() => 'https://meyer.de') })
    expect(r.ok && r.bericht.proben[0]).toContain('https://meyer.de')
  })

  it('haelt eine Drossel zwischen den Abrufen ein', async () => {
    // ⚠ Der Discovery-Lauf kann parallel laufen und nutzt denselben Schluessel.
    const gewartet: number[] = []
    const z = zustand({
      kandidaten: [
        { id: 'L1', firma: 'A', name: 'A', ort: 'X', google_place_id: 'p1' },
        { id: 'L2', firma: 'B', name: 'B', ort: 'Y', google_place_id: 'p2' },
      ],
    })
    await holeWebsitesAusPlaces({
      ...basis, db: db(z), places: adapter(() => null),
      warte: async (ms) => { gewartet.push(ms) },
    })
    expect(gewartet).toHaveLength(1)   // vor dem ZWEITEN Abruf, nicht vor dem ersten
  })

  it('meldet einen Lesefehler, statt einen leeren Bericht zu behaupten', async () => {
    const r = await holeWebsitesAusPlaces({
      ...basis, db: db(zustand({ ladeFehler: 'permission denied' })),
      places: adapter(() => null),
    })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unerwartet')
    expect(r.error).toContain('permission denied')
  })

  it('fragt Places gar nicht erst, wenn es keine Kandidaten gibt', async () => {
    const websiteVon = vi.fn()
    const r = await holeWebsitesAusPlaces({
      ...basis, db: db(zustand({ kandidaten: [] })),
      places: { ...adapter(() => null), websiteVon },
    })
    expect(r.ok && r.bericht.betrachtet).toBe(0)
    expect(websiteVon).not.toHaveBeenCalled()
  })
})
