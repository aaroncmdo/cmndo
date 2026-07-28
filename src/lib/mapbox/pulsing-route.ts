// Gerichteter „fließender Puls" entlang einer bestehenden Route-Linie (Mapbox).
// Aaron 17.07.: der Werkstatt-Finder soll die Route VOM Kunden ZUR Werkstatt pulsieren
// lassen, der Gutachter-Finder die Route VOM Gutachter ZUM Kunden — jeweils gerichtet
// „aufleuchten".
//
// Technik (28.07. neu): EINE eindeutig wandernde helle Bande via `line-gradient` — NICHT mehr die
// früheren „marching dashes" (`line-dasharray`). Die Dash-Animation war perzeptuell MEHRDEUTIG
// (Aperture-Effekt: viele identische Striche → das Auge kann die Laufrichtung nicht sicher lesen;
// die Standard-Mapbox-Dash-Sequenz splittet die Striche zwischen den Phasen zusätzlich 3→5 auf,
// wodurch die Richtung praktisch unlesbar wird). Eine EINZELNE helle Bande, die die Linie
// entlangläuft, hat kein Aperture-Problem — das Auge verfolgt DIE Bande → die Richtung ist
// unmissverständlich. Zusätzlich ist sie headless beweisbar: zwei Standbilder zeigen die Bande an
// messbar verschiedenen Positionen (die Dash-Richtung war in Standbildern nicht assertbar).
//
// Richtung: die Route-Geometrie ist von coord[0] (`start`) nach coord[n] (`end`) geordnet.
// `line-progress` läuft 0 (start) → 1 (end). `direction:'forward'` = die Bande wandert start→end
// (line-progress steigt), `'reverse'` = end→start (fällt). So deckt EINE Utility beide Finder ab,
// ohne die Geometrie umzudrehen:
//   Werkstatt: Geometrie Kunde→Werkstatt + 'forward' → Bande fließt zur Werkstatt (coord[n]).
//   Gutachter: Geometrie Kunde→SV       + 'reverse' → Bande fließt zum Kunden   (coord[0]).
//
// ⚠ Voraussetzung: die GeoJSON-Source MUSS `lineMetrics: true` tragen (sonst rendert
// `line-gradient` nicht) — die beiden Caller (FinderMap / WerkstattFinderShell) setzen das
// beim `addSource`.

import type { Map as MapboxMap } from 'mapbox-gl'

export type FlowDirection = 'forward' | 'reverse'

/**
 * Helligkeit [0..1] der Puls-Bande an line-progress `pos`, wenn die Bande bei `pos = t` zentriert
 * ist. Dreieckiges Profil (hell in der Mitte, linear auf 0 an den Rändern ±`halfWidth`). Die
 * Distanz ist RING-förmig (Wrap über die 0/1-Grenze) → die Bande tritt am einen Ende nahtlos
 * wieder ein, wenn sie am anderen austritt = kontinuierlicher Fluss ohne harten Sprung.
 * Reiner, testbarer Kern der Animation.
 */
export function bandBrightness(pos: number, t: number, halfWidth: number): number {
  if (halfWidth <= 0) return 0
  let d = Math.abs(pos - t)
  if (d > 0.5) d = 1 - d // Ring-Distanz: der kürzere Weg um das Intervall [0,1]
  const b = 1 - d / halfWidth
  return b > 0 ? b : 0
}

/**
 * Baut den `line-gradient`-Ausdruck für eine bei `t` zentrierte Bande. Feste, streng aufsteigende
 * Stops (`i/STOPS`) → IMMER ein gültiger Mapbox-`interpolate`-Ausdruck, ohne Rand-Sonderfälle
 * (dynamische Stops müssten an den Enden geklemmt + dedupliziert werden). `peakAlpha` = maximale
 * Deckkraft in der Bandmitte; dazwischen transparent (die solide Route darunter scheint durch).
 */
export function bandGradient(t: number, halfWidth: number, color: string, peakAlpha: number): unknown[] {
  const [r, g, b] = hexToRgb(color)
  const STOPS = 24
  const expr: unknown[] = ['interpolate', ['linear'], ['line-progress']]
  for (let i = 0; i <= STOPS; i++) {
    const pos = i / STOPS
    const a = bandBrightness(pos, t, halfWidth) * peakAlpha
    expr.push(pos, `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`)
  }
  return expr
}

/** '#rrggbb' → [r,g,b] (0..255). Fällt auf Weiß zurück, wenn der String kein 6-stelliges Hex ist. */
function hexToRgb(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim())
  if (!m) return [255, 255, 255]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export type PulsingFlowHandle = { remove: () => void }

/**
 * Legt eine animierte gerichtete Puls-Bande (`line-gradient`) auf eine BESTEHENDE GeoJSON-Source
 * (LineString, `lineMetrics: true`). Idempotent: ein vorhandener gleichnamiger Layer wird zuerst
 * entfernt. Gibt ein Handle mit `.remove()` zurück (stoppt die rAF-Schleife + entfernt den Layer).
 *
 * Voraussetzung: `sourceId` existiert bereits MIT `lineMetrics: true` + der Style ist geladen
 * (Caller stellt beides sicher).
 */
export function addPulsingFlow(
  map: MapboxMap,
  opts: {
    sourceId: string
    layerId: string
    color?: string
    direction?: FlowDirection
    /** line-width (px) — Zahl oder Mapbox-Expression. Default 4. */
    width?: number | unknown[]
    /** ms für einen vollen Durchlauf der Bande über die Route. Default 3500. */
    traverseMs?: number
    /** halbe Bandbreite als Anteil der Routenlänge [0..0.5]. Default 0.13. */
    halfWidth?: number
    /** max. Deckkraft in der Bandmitte. Default 0.9. */
    peakAlpha?: number
    /** z-Order: Layer davor einfügen (sonst oben auf). */
    beforeId?: string
  },
): PulsingFlowHandle {
  const {
    sourceId,
    layerId,
    color = '#ffffff',
    direction = 'forward',
    width = 4,
    traverseMs = 3500,
    halfWidth = 0.13,
    peakAlpha = 0.9,
    beforeId,
  } = opts

  // Idempotenz: alten Puls-Layer entfernen (Re-Route ruft evtl. erneut).
  if (map.getLayer(layerId)) {
    try {
      map.removeLayer(layerId)
    } catch {
      /* Layer schon weg — egal */
    }
  }

  // 'forward' → Bande wandert zu coord[n] (line-progress steigt); 'reverse' → zu coord[0] (fällt).
  // Startposition an der jeweiligen QUELLE, damit der Fluss sichtbar VON dort ausgeht.
  const dir = direction === 'reverse' ? -1 : 1
  let t = direction === 'reverse' ? 1 : 0

  map.addLayer(
    {
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'line-width': width as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'line-gradient': bandGradient(t, halfWidth, color, peakAlpha) as any,
      },
    },
    beforeId,
  )

  let lastTs = 0
  let lastRenderTs = 0
  let raf = 0
  let stopped = false
  const speedPerMs = 1 / Math.max(1, traverseMs)

  const tick = (ts: number) => {
    if (stopped) return
    if (lastTs === 0) lastTs = ts
    const dt = ts - lastTs
    lastTs = ts
    // Bande weiterbewegen (frame-rate-unabhängig über echtes dt) + in [0,1) wrappen.
    t += dir * speedPerMs * dt
    t = ((t % 1) + 1) % 1
    // Gradient-Neuaufbau auf ~30 fps drosseln (setPaintProperty pro Frame wäre unnötig teuer).
    if (ts - lastRenderTs >= 33) {
      lastRenderTs = ts
      // Der Layer kann während einer Style-Reload kurz fehlen — defensiv prüfen.
      if (map.getLayer(layerId)) {
        try {
          map.setPaintProperty(
            layerId,
            'line-gradient',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            bandGradient(t, halfWidth, color, peakAlpha) as any,
          )
        } catch {
          /* transient während Style-Reload */
        }
      }
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    remove() {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      if (map.getLayer(layerId)) {
        try {
          map.removeLayer(layerId)
        } catch {
          /* schon weg */
        }
      }
    },
  }
}
