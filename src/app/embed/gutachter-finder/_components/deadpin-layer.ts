import type { Map as MapboxMap } from 'mapbox-gl'

/**
 * Dead-Pins als geclusterte Kartenebene statt als DOM-Marker.
 *
 * ⚠ Der Anlass: Die Lead-Discovery hat den Bestand von 62 auf über 7.000
 * Betriebe gebracht. Jeder Dead-Pin war bisher ein eigenes DOM-Element, das
 * mapbox-gl bei JEDEM Pan- und Zoom-Frame neu positioniert. Bei 62 ist das
 * unauffällig, bei 7.000 wird das Ziehen der Karte zäh — und zwar ohne Fehler,
 * ohne Log, einfach nur langsam.
 *
 * ⭐ Die Optik bleibt EXAKT dieselbe (Aaron, 21.08.: „im gleichen Format wie die
 * dead pins"). Das Icon wird deshalb nicht als mapbox-`circle` nachempfunden,
 * sondern als Bild gezeichnet — mit demselben Durchmesser, demselben Rand,
 * demselben Schatten und demselben „C" wie das bisherige DOM-Element. Ein
 * `circle`-Layer könnte den Schatten gar nicht.
 *
 * Neu ist nur, was beim HERAUSZOOMEN passiert: Statt tausender überlappender
 * Punkte zeigt die Karte Cluster-Kreise mit Anzahl, die beim Hineinzoomen
 * aufgehen.
 */

export const DEADPIN_SOURCE = 'sv-deadpins'
export const DEADPIN_ICON = 'sv-deadpin-icon'
export const LAYER_CLUSTER = 'sv-deadpins-cluster'
export const LAYER_CLUSTER_ZAHL = 'sv-deadpins-cluster-zahl'
export const LAYER_EINZELN = 'sv-deadpins-einzeln'

/** Die Maße des bisherigen DOM-Markers — Änderungen hier ändern die Optik. */
const DURCHMESSER = 18
const RAND = 2
const SCHATTEN_UNSCHAERFE = 6
const SCHATTEN_VERSATZ_Y = 2

export type DeadPin = { id: string; lat: number; lng: number }

/**
 * Zeichnet das Pin-Bild — pixelgenau wie das bisherige DOM-Element.
 *
 * ⚠ `pixelRatio: 2`: ohne das wirkt das Bild auf Bildschirmen mit hoher
 * Auflösung weich, während die DOM-Marker daneben scharf blieben. Der
 * Unterschied fällt genau dann auf, wenn beide gleichzeitig sichtbar sind —
 * also beim hervorgehobenen Pin.
 */
export function zeichneDeadPin(navy: string): { data: Uint8Array; width: number; height: number } | null {
  if (typeof document === 'undefined') return null

  const skala = 2
  const rand = SCHATTEN_UNSCHAERFE + 2
  const kante = (DURCHMESSER + rand * 2) * skala

  const canvas = document.createElement('canvas')
  canvas.width = kante
  canvas.height = kante
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(skala, skala)
  const mitte = (DURCHMESSER + rand * 2) / 2
  const radius = DURCHMESSER / 2 - RAND / 2

  ctx.shadowColor = 'rgba(13,27,62,0.30)'
  ctx.shadowBlur = SCHATTEN_UNSCHAERFE
  ctx.shadowOffsetY = SCHATTEN_VERSATZ_Y

  ctx.beginPath()
  ctx.arc(mitte, mitte, radius, 0, Math.PI * 2)
  ctx.fillStyle = navy
  ctx.fill()

  // Der weisse Rand darf keinen eigenen Schatten werfen — sonst wirkt er doppelt.
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = RAND
  ctx.strokeStyle = '#fff'
  ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.font = '900 9px Montserrat, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // +0.5: dieselbe optische Mitte wie im DOM-Element, wo `place-items:center`
  // die Grundlinie der Schrift anders setzt als die Zeichenfläche.
  ctx.fillText('C', mitte, mitte + 0.5)

  const bild = ctx.getImageData(0, 0, kante, kante)
  return { data: new Uint8Array(bild.data.buffer), width: kante, height: kante }
}

function alsFeatures(pins: DeadPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature' as const,
      // Die Kennung MUSS mit — der gewählte Pin wird darüber wiedergefunden.
      properties: { id: p.id },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  }
}

/**
 * Legt Quelle und Ebenen an. Idempotent: ein zweiter Aufruf aktualisiert nur
 * die Daten.
 */
export function setzeDeadPinEbene(
  map: MapboxMap,
  pins: DeadPin[],
  navy: string,
  /** Injizierbar — die Ebenen-Logik ist dadurch ohne Browser-Canvas prüfbar. */
  zeichne: typeof zeichneDeadPin = zeichneDeadPin,
): void {
  const vorhanden = map.getSource(DEADPIN_SOURCE)
  if (vorhanden) {
    ;(vorhanden as unknown as { setData: (d: GeoJSON.FeatureCollection) => void }).setData(alsFeatures(pins))
    return
  }

  if (!map.hasImage(DEADPIN_ICON)) {
    const bild = zeichne(navy)
    // ⚠ Ohne Bild KEINE Ebene: ein `symbol`-Layer mit fehlendem `icon-image`
    // rendert nichts und wirft dabei nicht — die Pins wären schlicht weg.
    if (!bild) return
    map.addImage(DEADPIN_ICON, bild, { pixelRatio: 2 })
  }

  map.addSource(DEADPIN_SOURCE, {
    type: 'geojson',
    data: alsFeatures(pins),
    cluster: true,
    // Ab dieser Stufe keine Cluster mehr — darunter sind die Punkte weit genug
    // auseinander, um einzeln lesbar zu sein.
    clusterMaxZoom: 11,
    clusterRadius: 45,
  })

  map.addLayer({
    id: LAYER_CLUSTER,
    type: 'circle',
    source: DEADPIN_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': navy,
      'circle-opacity': 0.92,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
      // Der Kreis wächst mit der Anzahl — sonst sieht ein Cluster aus 5 genauso
      // aus wie einer aus 500, und die Karte verschweigt die Dichte.
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 22, 200, 28],
    },
  })

  map.addLayer({
    id: LAYER_CLUSTER_ZAHL,
    type: 'symbol',
    source: DEADPIN_SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      // ⚠ Schriften müssen im Mapbox-Style vorhanden sein. „DIN Offc Pro Medium"
      // mit „Arial Unicode MS Bold" als Rückfall ist das Paar, das die
      // Standard-Styles (streets-v12) garantiert mitbringen — ein nicht
      // vorhandener Name lässt die Beschriftung stillschweigend verschwinden.
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': ['step', ['get', 'point_count'], 11, 50, 12, 200, 13],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#fff' },
  })

  map.addLayer({
    id: LAYER_EINZELN,
    type: 'symbol',
    source: DEADPIN_SOURCE,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': DEADPIN_ICON,
      // Überlappen erlauben: die Pins zeigen DICHTE. Mapbox würde sonst
      // einander verdeckende Punkte weglassen, und die Karte sähe leerer aus,
      // als das Netz ist.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
}

/** Entfernt Ebenen und Quelle — für den Neuaufbau nach einem Style-Wechsel. */
export function entferneDeadPinEbene(map: MapboxMap): void {
  for (const id of [LAYER_EINZELN, LAYER_CLUSTER_ZAHL, LAYER_CLUSTER]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(DEADPIN_SOURCE)) map.removeSource(DEADPIN_SOURCE)
}
