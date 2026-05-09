'use client'

// 2026-05-07: Echter 3D-Render des SV-Autos via Mapbox-`model`-Layer
// (Mapbox-GL v3+, native — kein three.js extra). Ersetzt den Top-Down-SVG-
// Marker (`sv-marker.ts → addSvCarMarker`) sobald ein gueltiges glTF/glb-
// Modell unter dem konfigurierten Pfad geladen werden kann.
//
// Architektur:
//   - `tryAddSvCar3dModel(map, glbUrl, lngLat, heading)`: legt eine
//     ModelSource + Model-Layer an. Resolve mit `true` wenn der Source
//     erfolgreich geladen hat, mit `false` bei Fehler (404, korruptes glb,
//     CORS). Caller faellt dann auf den 2D-SVG-Marker zurueck.
//   - `updateSvCar3dPose(map, lngLat, heading)`: Live-Update via
//     `setModels()` — re-uploadet das glb NICHT (URI bleibt gleich).
//   - `removeSvCar3dModel(map)`: Cleanup beim Unmount.
//
// Aaron-Asset-Pfad: `/public/3d/sv-car.glb` (Default — Property `glbUrl`
// auch ueberschreibbar wenn pro-User-Models gewuenscht sind).

import type { Map as MapboxMap } from 'mapbox-gl'

export const SV_CAR_3D_DEFAULT_GLB = '/3d/sv-car.glb'
export const SV_CAR_3D_SOURCE_ID = 'sv-3d-car-src'
export const SV_CAR_3D_LAYER_ID = 'sv-3d-car-layer'
const MODEL_KEY = 'sv-car'

export type SvCar3dPose = {
  lngLat: [number, number]
  /** 0=Norden, im Uhrzeigersinn (Grad). Wird auf Z-Achse abgebildet. */
  heading: number | null
  /** Optional: gleichmaessiger Scale-Faktor. Default 1 — glb sollte realweltlich gross sein. */
  scale?: number
}

export type SvCar3dHandle = {
  /** Setzt Position + Bearing ohne Re-Download des Modells. */
  update: (pose: SvCar3dPose) => void
  /** Entfernt Layer + Source wieder. Idempotent. */
  remove: () => void
}

function modelSpec(pose: SvCar3dPose, glbUrl: string) {
  return {
    [MODEL_KEY]: {
      uri: glbUrl,
      position: pose.lngLat,
      orientation: [0, 0, pose.heading ?? 0] as [number, number, number],
    },
  }
}

/**
 * Versucht, das 3D-Auto-Modell zu laden. Resolved mit Handle bei Erfolg,
 * mit `null` bei jedem Fehler (404, parse-Fehler, Mapbox-`error`-Event).
 *
 * Wichtig: Mapbox-Source-Loads sind asynchron. Wir hoeren auf `data` +
 * `error` am Source-Scope und resolven, sobald wir wissen ob das glb
 * geladen werden konnte. Timeout 6 s — danach gilt der Versuch als
 * fehlgeschlagen.
 */
export async function tryAddSvCar3dModel(
  map: MapboxMap,
  pose: SvCar3dPose,
  options: { glbUrl?: string; timeoutMs?: number } = {},
): Promise<SvCar3dHandle | null> {
  const glbUrl = options.glbUrl ?? SV_CAR_3D_DEFAULT_GLB
  const timeoutMs = options.timeoutMs ?? 6000

  // Idempotent-Guard — falls beim Hot-Reload uebrig geblieben.
  if (map.getLayer(SV_CAR_3D_LAYER_ID)) {
    try { map.removeLayer(SV_CAR_3D_LAYER_ID) } catch { /* noop */ }
  }
  if (map.getSource(SV_CAR_3D_SOURCE_ID)) {
    try { map.removeSource(SV_CAR_3D_SOURCE_ID) } catch { /* noop */ }
  }

  // Source mit Initial-Pose. Mapbox laedt das glb sobald die Source
  // attached ist — Erfolg/Fehler kommen via Map-Events.
  try {
    map.addSource(SV_CAR_3D_SOURCE_ID, {
      type: 'model',
      models: modelSpec(pose, glbUrl),
    })
  } catch {
    return null
  }

  return new Promise<SvCar3dHandle | null>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      map.off('error', onError)
      map.off('sourcedata', onData)
      if (!ok) {
        try { map.removeSource(SV_CAR_3D_SOURCE_ID) } catch { /* noop */ }
        resolve(null)
        return
      }
      // Layer erst anlegen, wenn die Source geladen ist — sonst
      // rendert Mapbox einen leeren Slot.
      // 2026-05-08 (C11): Paint-Properties für PBR-Look. Ohne diese
      // rendert Mapbox-model den GLB mit Default-Material das sehr
      // matt wirkt. Roughness 0.35 gibt subtile Carlack-Reflexionen,
      // emissive-strength 0.15 hält das Auto auch in dunklen Buildings
      // sichtbar. Scale 1.6 weil Default-Grösse bei Zoom 17.8 zu klein
      // wirkte. Cast/Receive-Shadows ergänzt für Tageszeit-Realismus.
      try {
        map.addLayer({
          id: SV_CAR_3D_LAYER_ID,
          type: 'model',
          source: SV_CAR_3D_SOURCE_ID,
          slot: 'top',
          paint: {
            // PBR-Materialwerte: Roughness 0.25 gibt mehr Carlack-Glanz als 0.35.
            // AO-Intensity 0.85 zeichnet Spalt-Schatten (Türen, Radkästen) plastisch.
            // Emissive-Strength 0.12 hält Sichtbarkeit in Nacht-Szenen.
            'model-roughness': 0.25,
            'model-emissive-strength': 0.12,
            'model-ambient-occlusion-intensity': 0.85,
            'model-scale': [1.6, 1.6, 1.6],
            'model-cast-shadows': true,
            'model-receive-shadows': true,
            'model-cutoff-fade-range': 0.2,
          },
        } as Parameters<typeof map.addLayer>[0])
      } catch {
        try { map.removeSource(SV_CAR_3D_SOURCE_ID) } catch { /* noop */ }
        resolve(null)
        return
      }
      resolve({
        update: (next) => {
          const src = map.getSource(SV_CAR_3D_SOURCE_ID) as unknown as {
            setModels?: (m: ReturnType<typeof modelSpec>) => void
          } | undefined
          src?.setModels?.(modelSpec(next, glbUrl))
        },
        remove: () => {
          try { if (map.getLayer(SV_CAR_3D_LAYER_ID)) map.removeLayer(SV_CAR_3D_LAYER_ID) } catch { /* noop */ }
          try { if (map.getSource(SV_CAR_3D_SOURCE_ID)) map.removeSource(SV_CAR_3D_SOURCE_ID) } catch { /* noop */ }
        },
      })
    }

    const onError = (e: { sourceId?: string; error?: Error }) => {
      if (e?.sourceId === SV_CAR_3D_SOURCE_ID) finish(false)
    }
    const onData = (e: { sourceId?: string; isSourceLoaded?: boolean; sourceDataType?: string }) => {
      if (e?.sourceId !== SV_CAR_3D_SOURCE_ID) return
      if (e.isSourceLoaded) finish(true)
    }
    map.on('error', onError)
    map.on('sourcedata', onData)
    const timer = window.setTimeout(() => finish(false), timeoutMs)
  })
}
