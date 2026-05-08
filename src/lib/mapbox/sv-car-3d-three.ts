'use client'

// 2026-05-08 (C11b): Three.js-basierte SV-Auto-3D-Render-Pipeline.
// Ergänzt den existierenden Mapbox-`model`-Layer-Pfad (sv-3d-car.ts).
//
// Vorteil ggü. Mapbox-model:
//   - Kann OBJ-Files laden (Mapbox-model nimmt nur glTF/glb)
//   - Volle Material-Kontrolle (PBR-Tweaks, envMap, custom shading)
//   - Eigene Schatten + Lichtquellen
//
// Aktivierung via ENV:
//   NEXT_PUBLIC_SV_CAR_OBJ_URL = /3d/porsche.obj
//     → Three.js OBJLoader-Pfad
//   (kein Flag) → bleibt auf Mapbox-model mit /3d/sv-car.glb
//
// Pipeline:
//   1. Caller (FeldmodusMap) ruft tryAddSvCarThreeJs(map, pose, url)
//   2. Function legt Custom-Layer an, OBJLoader streamt das File
//   3. Bei Erfolg: addLayer + Handle für update/remove
//   4. Bei Fehler: resolve(null) → Caller fällt auf 2D-SVG-Marker
//
// Performance-Hinweis: OBJ-Files sind text-basiert und sehr groß
// (498 MB für ein hi-res Porsche-Modell). Web-praktikabel sind
// decimierte Modelle < 5 MB. Optimum: vorher Blender → Decimate (0.05)
// → glb-Export mit Draco — dann kann der existing Mapbox-model-Pfad
// das laden und dieser Three.js-Pfad ist nicht mehr nötig.

import * as THREE from 'three'
import mapboxgl, { type Map as MapboxMap, type CustomLayerInterface } from 'mapbox-gl'

export const SV_CAR_THREE_LAYER_ID = 'sv-3d-car-three-layer'

export type SvCarThreePose = {
  lngLat: [number, number]
  /** 0 = Norden, im Uhrzeigersinn (Grad). */
  heading: number | null
  /** Optionaler Scale-Faktor — Default 1. OBJ-Files sind oft in
   *  unrealistischen Einheiten exportiert (Zentimeter, Inches),
   *  daher in der Regel scale anpassen. */
  scale?: number
}

export type SvCarThreeHandle = {
  update: (pose: SvCarThreePose) => void
  remove: () => void
}

function buildModelMatrix(lng: number, lat: number, altitudeM: number): THREE.Matrix4 {
  const origin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitudeM)
  const scale = origin.meterInMercatorCoordinateUnits()
  return new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .scale(new THREE.Vector3(scale, -scale, scale))
    .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2))
}

/**
 * Versucht, ein OBJ-Modell als Three.js-Custom-Layer in Mapbox zu laden.
 * Bei Fehler (404, parse-Error, OOM) returnt null — Caller fällt auf
 * 2D-SVG-Marker zurück.
 */
export async function tryAddSvCarThreeJs(
  map: MapboxMap,
  pose: SvCarThreePose,
  options: { objUrl: string; mtlUrl?: string },
): Promise<SvCarThreeHandle | null> {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')

  // Lade OBJ async. OBJ-Files sind text-basiert und können >100MB sein —
  // wir streamen, aber Three.js OBJLoader hält am Ende alles im Memory.
  // Dauer 5-30s bei großen Files, Browser-Tab kann hängen.
  let model: THREE.Group | null = null
  try {
    const loader = new OBJLoader()
    model = await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        options.objUrl,
        (g) => resolve(g),
        undefined,
        (err) => reject(err),
      )
    })
  } catch (err) {
    console.error('[sv-car-three] OBJ-Load failed:', err)
    return null
  }
  if (!model) return null

  const loadedModel: THREE.Group = model

  // Default-PBR-Material falls das OBJ kein MTL referenziert (häufig bei
  // hand-decimated OBJs). Carlack-typisch.
  loadedModel.traverse((obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      const m = mesh.material as THREE.Material | undefined
      if (!m || (m as THREE.MeshBasicMaterial).type === 'MeshBasicMaterial') {
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0x1e3a5f, // Claimondo-Navy als Default-Lack
          metalness: 0.6,
          roughness: 0.35,
        })
      }
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })

  const initialScale = pose.scale ?? 1

  // Custom-Layer
  const state = {
    target: pose.lngLat,
    heading: pose.heading ?? 0,
    scale: initialScale,
  }
  let scene: THREE.Scene | null = null
  let camera: THREE.Camera | null = null
  let renderer: THREE.WebGLRenderer | null = null
  let directionalLight: THREE.DirectionalLight | null = null

  const customLayer: CustomLayerInterface = {
    id: SV_CAR_THREE_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd(_map, gl) {
      camera = new THREE.Camera()
      scene = new THREE.Scene()
      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      directionalLight = new THREE.DirectionalLight(0xffffff, 0.9)
      directionalLight.position.set(0.3, 1, 0.5).normalize().multiplyScalar(50)
      scene.add(directionalLight)
      scene.add(loadedModel)
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
    },

    render(_gl, projectionInput: unknown) {
      if (!scene || !camera || !renderer) return
      let matrixArr: number[] | null = null
      if (Array.isArray(projectionInput)) {
        matrixArr = projectionInput as number[]
      } else if (projectionInput && typeof projectionInput === 'object' && 'defaultProjectionData' in projectionInput) {
        const proj = (projectionInput as { defaultProjectionData?: { mainMatrix?: number[] } }).defaultProjectionData
        matrixArr = proj?.mainMatrix ?? null
      }
      if (!matrixArr) return

      const projection = new THREE.Matrix4().fromArray(matrixArr)
      const local = buildModelMatrix(state.target[0], state.target[1], 0)
      // Heading + Scale auf das Model anwenden
      loadedModel.rotation.set(0, 0, 0)
      loadedModel.rotateY(((state.heading ?? 0) * Math.PI) / 180)
      loadedModel.scale.setScalar(state.scale)
      camera.projectionMatrix = projection.multiply(local)
      renderer.resetState()
      renderer.render(scene, camera)
    },

    onRemove() {
      loadedModel.traverse((obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh
          mesh.geometry?.dispose()
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose()
        }
      })
      scene = null
      camera = null
      renderer = null
      directionalLight = null
    },
  }

  try {
    map.addLayer(customLayer)
  } catch (err) {
    console.error('[sv-car-three] addLayer failed:', err)
    return null
  }

  return {
    update(next: SvCarThreePose) {
      state.target = next.lngLat
      state.heading = next.heading ?? 0
      if (next.scale != null) state.scale = next.scale
      try { map.triggerRepaint() } catch { /* noop */ }
    },
    remove() {
      try { if (map.getLayer(SV_CAR_THREE_LAYER_ID)) map.removeLayer(SV_CAR_THREE_LAYER_ID) } catch { /* noop */ }
    },
  }
}

/** Liefert die ENV-Konfigurierte OBJ-URL falls aktiviert, sonst null. */
export function getSvCarObjUrl(): string | null {
  if (typeof window === 'undefined') return null
  const url = process.env.NEXT_PUBLIC_SV_CAR_OBJ_URL
  return url && url.trim().length > 0 ? url : null
}
