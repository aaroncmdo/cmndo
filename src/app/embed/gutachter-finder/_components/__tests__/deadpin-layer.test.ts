import { describe, expect, it, vi } from 'vitest'
import type { Map as MapboxMap } from 'mapbox-gl'
import {
  DEADPIN_ICON,
  DEADPIN_SOURCE,
  LAYER_CLUSTER,
  LAYER_CLUSTER_ZAHL,
  LAYER_EINZELN,
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
  it('legt eine GECLUSTERTE Quelle an', () => {
    // ⚠ Der Grund für den ganzen Umbau: 7.000 DOM-Marker macht mapbox bei jedem
    // Pan-Frame neu — ohne Fehler, einfach nur zäh.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)

    const q = k.quellen.get(DEADPIN_SOURCE)
    expect(q?.opts.cluster).toBe(true)
    expect(q?.opts.clusterMaxZoom).toBeGreaterThan(0)
  })

  it('legt drei Ebenen an: Cluster, Zahl, Einzelpin', () => {
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    expect(k.ebenen.map((e) => e.id)).toEqual([LAYER_CLUSTER, LAYER_CLUSTER_ZAHL, LAYER_EINZELN])
  })

  it('trennt Cluster und Einzelpins ueber den Filter — sonst zeichnet es doppelt', () => {
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)

    const cluster = k.ebenen.find((e) => e.id === LAYER_CLUSTER)
    const einzeln = k.ebenen.find((e) => e.id === LAYER_EINZELN)
    expect(cluster?.filter).toEqual(['has', 'point_count'])
    expect(einzeln?.filter).toEqual(['!', ['has', 'point_count']])
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

  it('laesst den Cluster-Kreis mit der Anzahl WACHSEN', () => {
    // Sonst sieht ein Cluster aus 5 genauso aus wie einer aus 500 — die Karte
    // verschwiege die Dichte.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    const cluster = k.ebenen.find((e) => e.id === LAYER_CLUSTER)
    const radius = (cluster?.paint as Record<string, unknown>)['circle-radius'] as unknown[]
    expect(radius[0]).toBe('step')
    expect(radius.length).toBeGreaterThan(3)
  })

  it('nennt eine Schrift, die der Standard-Style mitbringt', () => {
    // ⚠ Ein nicht vorhandener Schriftname laesst die Cluster-Zahl
    // STILLSCHWEIGEND verschwinden — der Kreis bleibt, die Zahl fehlt.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    const zahl = k.ebenen.find((e) => e.id === LAYER_CLUSTER_ZAHL)
    expect((zahl?.layout as Record<string, unknown>)['text-font']).toContain('DIN Offc Pro Medium')
  })

  it('aktualisiert beim ZWEITEN Aufruf nur die Daten, statt doppelt anzulegen', () => {
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, icon)
    setzeDeadPinEbene(k.map, [...PINS, { id: 'c', lat: 48.1, lng: 11.6 }], NAVY, icon)

    expect(k.ebenen).toHaveLength(3)
    expect(k.quellen.get(DEADPIN_SOURCE)?.setData).toHaveBeenCalledTimes(1)
  })

  it('legt GAR KEINE Ebene an, wenn das Icon nicht gezeichnet werden kann', () => {
    // ⚠ Ein `symbol`-Layer mit fehlendem `icon-image` rendert nichts und wirft
    // dabei nicht — die Pins waeren schlicht weg, ohne jede Spur.
    const k = karte()
    setzeDeadPinEbene(k.map, PINS, NAVY, () => null)

    expect(k.ebenen).toHaveLength(0)
    expect(k.quellen.size).toBe(0)
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
