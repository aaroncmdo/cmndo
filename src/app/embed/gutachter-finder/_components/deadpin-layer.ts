import type { Map as MapboxMap } from 'mapbox-gl'

/**
 * Dead-Pins auf der Karte: Dichte-Wolke beim Überblick, einzelne Pins beim
 * Hineinzoomen.
 *
 * ⚠ Der Anlass war Leistung: Die Lead-Discovery hat den Bestand von 62 auf über
 * 8.000 Betriebe gebracht. Jeder Dead-Pin war ein eigenes DOM-Element, das
 * mapbox-gl bei JEDEM Pan- und Zoom-Frame neu positioniert — bei 62
 * unauffällig, bei tausenden zäh.
 *
 * ⭐ Der zweite, wichtigere Grund ist HALTUNG (Aaron, 21.08.: „das design der
 * bubbles ist sehr sehr aufdringlich entgegen der wirklich verfügbaren
 * partnern"). Auf der Karte stehen ~10 buchbare Partner gegen über 8.000
 * unbeanspruchte Einträge — ein Verhältnis von 1:800. Cluster-Kreise mit
 * Anzahl („72") lasen sich als Angebot, obwohl keiner davon buchbar ist: sie
 * waren dunkler als die Partner-Marker und zogen damit ausgerechnet auf das
 * Nicht-Verfügbare den Blick.
 *
 * ⭐⭐ Der ursprüngliche Zweck der Dead-Pins war laut Entscheid vom 12.06.
 * „Marker-Dichte ohne SV-Identität" — DICHTE, nicht Anzahl. Eine Zahl im
 * Cluster machte daraus eine Zusage. Deshalb gibt es hier keine Cluster mehr:
 *
 *   · herausgezoomt  → nur die weiche Abdeckungs-Wolke (zeigt WO, nicht WIE VIELE)
 *   · hineingezoomt  → die einzelnen Pins, unverändert in ihrer bisherigen Optik
 *
 * Die Partner-Marker bleiben dadurch der einzige harte Punkt auf der Karte.
 */

export const DEADPIN_SOURCE = 'sv-deadpins'
export const DEADPIN_ICON = 'sv-deadpin-icon'
export const LAYER_WOLKE = 'sv-deadpins-wolke'
export const LAYER_EINZELN = 'sv-deadpins-einzeln'

/**
 * Ab hier lösen sich Wolke und Einzelpins ab.
 *
 * Zoom 9 zeigt etwa einen Landkreis. Darunter wäre ein einzelner Punkt je
 * Betrieb Konfetti; darüber ist die Wolke zu grob, um noch etwas auszusagen.
 * Der Übergang überlappt bewusst um eine halbe Stufe, damit nie eine Lücke
 * entsteht, in der die Karte leer wirkt.
 */
export const ZOOM_UMSCHLAG = 9

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
 * Auflösung weich, während der DOM-Marker des gewählten Pins daneben scharf
 * bliebe. Der Unterschied fällt genau dann auf, wenn beide gleichzeitig
 * sichtbar sind.
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
 *
 * @param vorLayer Die Ebene, VOR der eingefügt wird — so bleiben die
 *   Partner-Marker und die Einsatzgebiete darüber. Ohne Angabe landet alles
 *   obenauf, und die Wolke legte sich über die Partnerflächen.
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
    // ⚠ Ohne Bild KEINE Pin-Ebene: ein `symbol`-Layer mit fehlendem
    // `icon-image` rendert nichts und wirft dabei nicht — die Pins wären
    // schlicht weg. Die Wolke kommt trotzdem, sie braucht kein Icon.
    if (bild) map.addImage(DEADPIN_ICON, bild, { pixelRatio: 2 })
  }

  // ⚠ KEIN `cluster: true` mehr. Cluster erzeugen Kreise mit Anzahl — genau
  // das, was als Angebot missverstanden wurde.
  map.addSource(DEADPIN_SOURCE, { type: 'geojson', data: alsFeatures(pins) })

  // ── Die Wolke: zeigt WO das Netz dicht ist, nicht wie viele es sind ──
  map.addLayer({
    id: LAYER_WOLKE,
    type: 'heatmap',
    source: DEADPIN_SOURCE,
    maxzoom: ZOOM_UMSCHLAG + 0.5,
    paint: {
      // ⚠ Diese Werte sind GEMESSEN, nicht geschätzt. Am 21.08. mit den echten
      // 8.323 Punkten in einem Prüfstand gerendert und verglichen:
      //
      //   Gewicht 0.09 / Radius 10  → praktisch unsichtbar
      //   Gewicht 0.16 / Radius 10  → immer noch kaum sichtbar
      //   Gewicht 0.12 / Radius 22  → Ballungsräume erkennbar, Land hell  ← das hier
      //   Gewicht 0.12 / Radius 32  → verwischt zu einer Fläche ohne Struktur
      //
      // ⭐ Die entscheidende Achse ist der RADIUS, nicht das Gewicht: bei Zoom 5
      // überlappen 10-Pixel-Punkte kaum, und ohne Überlappung entsteht gar keine
      // Dichte — dann bleibt die Wolke bei JEDEM Gewicht blass. Die frühere
      // Einstellung war auf 62 Pins abgestimmt und ließ sich nicht hochrechnen.
      'heatmap-weight': 0.12,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 1],
      'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 5, 22, 7, 46, 9, 130],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(123,163,204,0)',
        0.08, 'rgba(123,163,204,0.18)',
        0.35, 'rgba(123,163,204,0.30)',
        1, 'rgba(69,115,162,0.42)',
      ],
      // Sanft ausblenden, statt an der Zoomgrenze zu verschwinden.
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], ZOOM_UMSCHLAG - 0.5, 0.9, ZOOM_UMSCHLAG + 0.5, 0],
    },
  })

  // ── Die einzelnen Pins: erst wenn man nah genug ist, dass sie etwas heissen ──
  if (map.hasImage(DEADPIN_ICON)) {
    map.addLayer({
      id: LAYER_EINZELN,
      type: 'symbol',
      source: DEADPIN_SOURCE,
      minzoom: ZOOM_UMSCHLAG,
      layout: {
        'icon-image': DEADPIN_ICON,
        // Überlappen erlauben: die Pins zeigen DICHTE. Mapbox würde sonst
        // einander verdeckende Punkte weglassen, und die Karte sähe leerer aus,
        // als das Netz ist.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        // Sanft einblenden — dieselbe halbe Zoomstufe, in der die Wolke geht.
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], ZOOM_UMSCHLAG, 0, ZOOM_UMSCHLAG + 0.5, 1],
      },
    })
  }
}

/** Entfernt Ebenen und Quelle — für den Neuaufbau nach einem Style-Wechsel. */
export function entferneDeadPinEbene(map: MapboxMap): void {
  for (const id of [LAYER_EINZELN, LAYER_WOLKE]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(DEADPIN_SOURCE)) map.removeSource(DEADPIN_SOURCE)
}
