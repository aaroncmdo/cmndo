import { describe, expect, it, vi } from 'vitest'
import type { Map as MapboxMap } from 'mapbox-gl'
import {
  DEADPIN_ICON,
  DEADPIN_SOURCE,
  LAYER_EINZELN,
  LAYER_WOLKE,
  ZOOM_UMSCHLAG,
  entferneDeadPinEbene,
  setzeDeadPinEbene,
} from '../deadpin-layer'

const NAVY = '#0D1B3E'

/** Ein Ersatz-Icon — die Ebenen-Logik braucht nur, DASS eins entsteht. */
const icon = () => ({ data: new Uint8Array(4), width: 1, height: 1 })

function karte() {
  const quellen = new Map<string, { setData: ReturnType<typeof vi.fn>; opts: Record<string, unknown> }>()
  const ebenen: Record<string, unknown>[] = []
  const bilder = new Set<string>()

  const map = {
    getSource: (id: string) => quellen.get(id),
    addSource: (id: string, opts: Record<string, unknown>) => {
      quellen.set(id, { setData: vi.fn(), opts })
    },
    addLayer: (l: Record<string, unknown>) => { ebenen.push(l) },
    getLayer: (id: string) => ebenen.find((e) => e.id === id),
    removeLayer: (id: string) => {
      const i = ebenen.findIndex((e) => e.id === id)
      if (i >= 0) ebenen.splice(i, 1)
    },
    removeSource: (id: string) => { quellen.delete(id) },
    hasImage: (id: string) => bilder.has(id),
    addImage: (id: string) => { bilder.add(id) },
  } as unknown as MapboxMap

  return { map, quellen, ebenen, bilder }
}

const PINS = [
  { id: 'a', lat: 51.96, lng: 7.63 },
  { id: 'b', lat: 52.52, lng: 13.40 },
]

describe('setzeDeadPinEbene', () => {
  it('legt KEINE Cluster an — eine Zahl im Kreis las sich als Angebot', () => {
    // ⭐ Auf der Karte stehen ~10 buchbare Partner gegen ueber 8.000
    // unbeanspruchte Eintraege. Cluster-Kreise mit Anzahl („72") waren dunkler
    // als die Partner-Marker und zogen den Blick ausgerechnet auf das
    // Nicht-Verfuegbare.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    expect(k.quellen.get(DEADPIN_SOURCE)?.opts.cluster).toBeUndefined()
  })

  it('legt zwei Ebenen an: Wolke UNTEN, Einzelpins darueber', () => {
    // Die Reihenfolge ist die Zeichenreihenfolge — die Wolke darf die Pins
    // nicht verdecken.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    expect(k.ebenen.map((e) => e.id)).toEqual([LAYER_WOLKE, LAYER_EINZELN])
  })

  it('TRENNT die beiden ueber den Zoom', () => {
    // Herausgezoomt nur die Wolke (zeigt WO, nicht WIE VIELE), hineingezoomt
    // die Pins. Ohne Trennung laege beides uebereinander.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    const wolke = k.ebenen.find((e) => e.id === LAYER_WOLKE)
    const pins = k.ebenen.find((e) => e.id === LAYER_EINZELN)
    expect(pins?.minzoom).toBe(ZOOM_UMSCHLAG)
    expect(wolke?.maxzoom).toBeGreaterThan(ZOOM_UMSCHLAG)
  })

  it('UEBERLAPPT den Uebergang — sonst waere die Karte kurz leer', () => {
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    const wolke = k.ebenen.find((e) => e.id === LAYER_WOLKE) as { maxzoom: number }
    const pins = k.ebenen.find((e) => e.id === LAYER_EINZELN) as { minzoom: number }
    expect(wolke.maxzoom).toBeGreaterThan(pins.minzoom)
  })

  it('haelt das Gewicht je Punkt NIEDRIG', () => {
    // ⚠ Die fruehere Wolke war auf 62 Pins abgestimmt. Mit ueber 8.000 waere
    // bei gleichem Gewicht (1.0) ganz Deutschland zugedeckt, und eine Flaeche
    // ohne Struktur sagt nichts mehr aus.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    const wolke = k.ebenen.find((e) => e.id === LAYER_WOLKE)
    expect((wolke?.paint as Record<string, number>)['heatmap-weight']).toBeLessThan(0.3)
  })

  it('haelt den Radius GROSS genug, dass ueberhaupt Dichte entsteht', () => {
    // ⭐ Der Prueflauf mit den echten 8.323 Punkten zeigte: bei Radius 10 blieb
    // die Wolke bei JEDEM Gewicht unsichtbar — ohne Ueberlappung keine Dichte.
    // Der Radius ist die entscheidende Achse, nicht das Gewicht.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    const wolke = k.ebenen.find((e) => e.id === LAYER_WOLKE)
    const radius = (wolke?.paint as Record<string, unknown>)['heatmap-radius'] as unknown[]
    // ['interpolate', ['exponential',2], ['zoom'], 5, <r>, …] → der Wert bei Zoom 5
    expect(Number(radius[4])).toBeGreaterThanOrEqual(18)
  })

  it('traegt die Kennung an jedem Punkt — der gewaehlte Pin wird darueber gefunden', () => {
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)

    const daten = (k.quellen.get(DEADPIN_SOURCE)?.opts.data ?? {}) as GeoJSON.FeatureCollection
    expect(daten.features).toHaveLength(2)
    expect(daten.features[0].properties).toEqual({ id: 'a' })
    expect(daten.features[0].geometry).toEqual({ type: 'Point', coordinates: [7.63, 51.96] })
  })

  it('laesst Icons UEBERLAPPEN — die Pins zeigen Dichte', () => {
    // ⚠ Ohne das laesst mapbox einander verdeckende Punkte weg, und die Karte
    // saehe leerer aus, als das Netz ist.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    const einzeln = k.ebenen.find((e) => e.id === LAYER_EINZELN)
    expect((einzeln?.layout as Record<string, unknown>)['icon-allow-overlap']).toBe(true)
  })

  it('aktualisiert beim ZWEITEN Aufruf nur die Daten, statt doppelt anzulegen', () => {
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    setzeDeadPinEbene(k.map, [...PINS, { id: 'c', lat: 48.1, lng: 11.6 }], NAVY, icon)

    expect(k.ebenen).toHaveLength(2)
    expect(k.quellen.get(DEADPIN_SOURCE)?.setData).toHaveBeenCalledTimes(1)
  })

  it('legt die WOLKE auch dann an, wenn das Icon fehlt — nur die Pins entfallen', () => {
    // ⚠ Ein `symbol`-Layer mit fehlendem `icon-image` rendert nichts und wirft
    // dabei nicht. Die Wolke braucht kein Icon und soll deshalb trotzdem
    // erscheinen — sonst waere die Karte auf Uebersichtszoom voellig leer.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, () => null)

    expect(k.ebenen.map((e) => e.id)).toEqual([LAYER_WOLKE])
    expect(k.bilder.has(DEADPIN_ICON)).toBe(false)
  })
})

describe('entferneDeadPinEbene', () => {
  it('raeumt Ebenen und Quelle ab', () => {
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    entferneDeadPinEbene(k.map)

    expect(k.ebenen).toHaveLength(0)
    expect(k.quellen.has(DEADPIN_SOURCE)).toBe(false)
    // Das Bild bleibt registriert — es haengt am Style, nicht an der Quelle.
    expect(k.bilder.has(DEADPIN_ICON)).toBe(true)
  })

  it('kommt mit einer Karte ohne Ebene zurecht', () => {
    const k = karte()
    expect(() => entferneDeadPinEbene(k.map)).not.toThrow()
  })
})
