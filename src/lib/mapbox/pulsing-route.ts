// Gerichteter „fließender Puls" entlang einer bestehenden Route-Linie (Mapbox).
// Aaron 17.07.: der Werkstatt-Finder soll die Route VOM Kunden ZUR Werkstatt pulsieren
// lassen, der Gutachter-Finder die Route VOM Gutachter ZUM Kunden — jeweils gerichtet
// „aufleuchten". Technik = animiertes `line-dasharray` (die klassische Mapbox-„marching
// dashes"-Animation): eine helle gestrichelte Overlay-Linie über der soliden Route, deren
// Dash-Muster pro Frame durch eine Sequenz zykelt → die Striche wandern die Linie entlang.
//
// Richtung: die Route-Geometrie ist von `start` nach `end` geordnet. `direction:'forward'`
// lässt den Puls start→end fließen, `'reverse'` end→start — so deckt EINE Utility beide
// Finder ab, ohne die Geometrie umzudrehen (Werkstatt: Geometrie Kunde→Werkstatt + forward;
// Gutachter: Geometrie Kunde→SV + reverse = SV→Kunde).

import type { Map as MapboxMap } from 'mapbox-gl'

/**
 * Dash-Frames (in line-width-Einheiten). Vorwärts durchgesteppt wandern die Striche
 * in Geometrie-Richtung; rückwärts entgegengesetzt. Standard-Mapbox-Sequenz („Add a line
 * animation") — ein voller Zyklus erzeugt eine gleichmäßige Fluss-Illusion.
 */
export const DASH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
]

export type FlowDirection = 'forward' | 'reverse'

/**
 * Nächster Frame-Index mit Wraparound. Reiner, testbarer Kern der Animation.
 * forward → +1 (mod total), reverse → −1 (mod total). Out-of-range/leere Sequenz
 * fällt sicher auf 0.
 */
export function stepIndex(current: number, total: number, direction: FlowDirection): number {
  if (total <= 0) return 0
  const c = ((current % total) + total) % total
  if (direction === 'reverse') return (c - 1 + total) % total
  return (c + 1) % total
}

/**
 * Mapbox-Gotcha (Aaron 27.07.): die animierte `line-dasharray`-Sequenz marschiert visuell
 * ENTGEGEN der Step-Richtung — forward-Stepping laesst die hellen Striche zu coord[0]
 * (Geometrie-START) wandern, nicht zu coord[n]. Damit `direction:'forward'` wie dokumentiert
 * (s. Header) visuell start->end (in Geometrie-Richtung) fliesst, wird intern invertiert gesteppt.
 * Ohne diese Korrektur lief der Gutachter-Puls Kunde->SV (falsch: zum SV) statt SV->Kunde und
 * der Werkstatt-Puls Werkstatt->Kunde (falsch: zum Kunden) statt Kunde->Werkstatt.
 */
export function visualStepDirection(direction: FlowDirection): FlowDirection {
  return direction === 'forward' ? 'reverse' : 'forward'
}

export type PulsingFlowHandle = { remove: () => void }

/**
 * Legt eine animierte gerichtete Puls-Overlay-Linie auf eine BESTEHENDE GeoJSON-Source
 * (LineString). Idempotent: ein vorhandener gleichnamiger Layer wird zuerst entfernt.
 * Gibt ein Handle mit `.remove()` zurück (stoppt die rAF-Schleife + entfernt den Layer).
 *
 * Voraussetzung: `sourceId` existiert bereits + der Style ist geladen (Caller stellt das sicher).
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
    /** ms pro Frame-Schritt. Default 55 (~18 Schritte/s). */
    stepMs?: number
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
    stepMs = 55,
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

  map.addLayer(
    {
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'line-width': width as any,
        'line-opacity': 0.9,
        'line-dasharray': DASH_SEQUENCE[0],
      },
    },
    beforeId,
  )

  let step = 0
  let lastTs = 0
  let raf = 0
  let stopped = false

  const tick = (ts: number) => {
    if (stopped) return
    if (ts - lastTs >= stepMs) {
      step = stepIndex(step, DASH_SEQUENCE.length, visualStepDirection(direction))
      // Der Layer kann während einer Style-Reload kurz fehlen — defensiv prüfen.
      if (map.getLayer(layerId)) {
        try {
          map.setPaintProperty(layerId, 'line-dasharray', DASH_SEQUENCE[step])
        } catch {
          /* transient während Style-Reload */
        }
      }
      lastTs = ts
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
