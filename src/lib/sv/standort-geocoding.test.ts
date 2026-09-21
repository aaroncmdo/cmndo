import { describe, it, expect, vi } from 'vitest'

// freigabe.ts (Quelle der Plausibilitaets-Schwelle) zieht ueber calculate-isochrone den
// Next-RSC-Guard 'server-only', der in der vitest-Node-Umgebung schon BEIM IMPORT wirft.
// Gleiches Muster wie in gib-basic-sv-frei-geo-guard.test.ts.
vi.mock('server-only', () => ({}))

import {
  baueSuchadresse,
  findePlzInAdresse,
  istPlausibel,
  macheStandortErmittler,
} from './standort-geocoding'

/** Wuppertal-Barmen, echte Referenz aus plz_geo. */
const WUPPERTAL = { lat: 51.2711, lng: 7.1938 }
/** ~560 km entfernt — der Niederbayern-Fall aus dem Freigabe-Guard. */
const NIEDERBAYERN = { lat: 48.5667, lng: 13.4319 }

describe('findePlzInAdresse', () => {
  it('liest die PLZ aus einem Freitext', () => {
    expect(findePlzInAdresse('Musterstraße 1, 42103 Wuppertal')).toBe('42103')
  })

  it('verwechselt eine Hausnummer nicht mit einer PLZ', () => {
    expect(findePlzInAdresse('Bahnhofstraße 7, Wuppertal')).toBeNull()
  })

  it('greift nicht in eine längere Ziffernfolge hinein', () => {
    // Ohne Ziffern-Grenze liefert /\d{5}/ hier "12345" aus einer achtstelligen Zahl.
    expect(findePlzInAdresse('Flurstück 12345678')).toBeNull()
  })

  it('ist leertolerant', () => {
    expect(findePlzInAdresse(null)).toBeNull()
    expect(findePlzInAdresse('')).toBeNull()
  })
})

describe('baueSuchadresse', () => {
  it('hängt die PLZ an, wenn sie fehlt', () => {
    expect(baueSuchadresse('Musterstraße 1', '42103')).toBe('Musterstraße 1, 42103')
  })

  it('doppelt die PLZ nicht, wenn sie schon im Text steht', () => {
    const a = 'Musterstraße 1, 42103 Wuppertal'
    expect(baueSuchadresse(a, '42103')).toBe(a)
  })

  it('nimmt die PLZ aus dem Feld, wenn der Text eine ANDERE trägt', () => {
    // Getippter Text und gepflegtes Feld widersprechen sich — beide mitgeben, Mapbox
    // gewichtet; die Plausibilitätsprüfung fängt einen Fehlgriff danach ab.
    expect(baueSuchadresse('Musterstraße 1, 40210 Düsseldorf', '42103')).toBe(
      'Musterstraße 1, 40210 Düsseldorf, 42103',
    )
  })

  it('gibt null zurück, wenn JEDER Ortsbezug fehlt — der 563-km-Fall', () => {
    // Eine Straße ohne Ort löst irgendwo in Deutschland auf. Lieber nicht fragen.
    expect(baueSuchadresse('Musterstraße 1', null)).toBeNull()
  })

  it('akzeptiert die PLZ allein', () => {
    expect(baueSuchadresse(null, '42103')).toBe('42103')
  })

  it('gibt null zurück, wenn gar nichts da ist', () => {
    expect(baueSuchadresse(null, null)).toBeNull()
  })
})

describe('istPlausibel', () => {
  it('lässt einen Treffer in derselben Stadt durch', () => {
    expect(istPlausibel({ lat: 51.2756, lng: 7.2 }, WUPPERTAL)).toBe(true)
  })

  it('verwirft den Niederbayern-Treffer zur Wuppertaler PLZ', () => {
    expect(istPlausibel(NIEDERBAYERN, WUPPERTAL)).toBe(false)
  })

  it('ist fail-open, wenn plz_geo die PLZ nicht kennt', () => {
    // Eine Lücke in der Referenztabelle darf keinen korrekten Standort verwerfen.
    expect(istPlausibel(NIEDERBAYERN, null)).toBe(true)
  })
})

describe('macheStandortErmittler — die Stufenfolge', () => {
  function ermittler(opts: {
    geocode?: (a: string) => Promise<{ lat: number; lng: number } | null>
    plz?: (p: string) => Promise<{ lat: number; lng: number } | null>
  }) {
    return macheStandortErmittler({
      geocode: opts.geocode ?? (async () => null),
      plzMittelpunkt: opts.plz ?? (async () => null),
    })
  }

  it('Stufe 1: Browser-Koordinaten werden übernommen, ohne jeden Aufruf', async () => {
    const geocode = vi.fn()
    const plz = vi.fn()
    const r = await ermittler({ geocode, plz })({
      adresse: 'Musterstraße 1',
      plz: '42103',
      lat: 51.1,
      lng: 7.1,
    })
    expect(r).toEqual({ ok: true, lat: 51.1, lng: 7.1, quelle: 'client' })
    expect(geocode).not.toHaveBeenCalled()
    expect(plz).not.toHaveBeenCalled()
  })

  it('Stufe 2: freier Text wird server-seitig aufgelöst', async () => {
    const r = await ermittler({
      geocode: async () => ({ lat: 51.2756, lng: 7.2 }),
      plz: async () => WUPPERTAL,
    })({ adresse: 'Musterstraße 1', plz: '42103' })
    expect(r).toEqual({ ok: true, lat: 51.2756, lng: 7.2, quelle: 'mapbox' })
  })

  it('Stufe 2 bekommt die PLZ mitgeliefert, nicht die nackte Straße', async () => {
    const geocode = vi.fn(async () => ({ lat: 51.2756, lng: 7.2 }))
    await ermittler({ geocode, plz: async () => WUPPERTAL })({
      adresse: 'Musterstraße 1',
      plz: '42103',
    })
    expect(geocode).toHaveBeenCalledWith('Musterstraße 1, 42103')
  })

  it('Stufe 3: ein unplausibler Treffer wird durch den PLZ-Mittelpunkt ersetzt', async () => {
    // Genau der prod-Fall: Mapbox antwortet, aber 563 km daneben. Ungenau in der
    // richtigen Region schlägt exakt in der falschen.
    const r = await ermittler({
      geocode: async () => NIEDERBAYERN,
      plz: async () => WUPPERTAL,
    })({ adresse: 'Musterstraße 1', plz: '42103' })
    expect(r).toEqual({ ok: true, ...WUPPERTAL, quelle: 'plz-mittelpunkt' })
  })

  it('Stufe 3: greift auch, wenn Mapbox gar nichts liefert', async () => {
    const r = await ermittler({ geocode: async () => null, plz: async () => WUPPERTAL })({
      adresse: 'Unbekannter Weg 99',
      plz: '42103',
    })
    expect(r).toEqual({ ok: true, ...WUPPERTAL, quelle: 'plz-mittelpunkt' })
  })

  it('erkennt die PLZ im Freitext, auch ohne eigenes PLZ-Feld', async () => {
    const plz = vi.fn(async () => WUPPERTAL)
    await ermittler({ geocode: async () => null, plz })({
      adresse: 'Musterstraße 1, 42103 Wuppertal',
    })
    expect(plz).toHaveBeenCalledWith('42103')
  })

  it('ohne jeden Ortsbezug wird NICHT geraten', async () => {
    const geocode = vi.fn()
    const r = await ermittler({ geocode })({ adresse: 'Musterstraße 1' })
    expect(r).toEqual({ ok: false, grund: 'keine-angabe' })
    expect(geocode).not.toHaveBeenCalled()
  })

  it('meldet einen ehrlichen Fehlschlag, wenn beide Stufen leer bleiben', async () => {
    const r = await ermittler({ geocode: async () => null, plz: async () => null })({
      adresse: 'Musterstraße 1',
      plz: '99999',
    })
    expect(r).toEqual({ ok: false, grund: 'nicht-aufloesbar' })
  })

  it('leere Eingabe ist kein Aufruf', async () => {
    const r = await ermittler({})({})
    expect(r).toEqual({ ok: false, grund: 'keine-angabe' })
  })
})
