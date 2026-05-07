'use client'

// 2026-05-07 Phase 2 (feldmodus-mapbox-3d-roadmap.md): Hero-Pin als Mapbox-
// Custom-Layer mit Three.js. Markiert das aktuelle Ziel des SVs mit einem
// pulsierenden, glühenden Pin der über der Karte schwebt.
//
// Architektur-Entscheidung gegen R3F-Overlay:
//   - Mapbox CustomLayer teilt sich den GL-Context mit der Map → kein
//     Camera-Sync-Drift, kein doppelter Canvas, smoother
//   - Three.js direkt statt R3F: weniger Code für so kleinen Use-Case
//   - R3F-Deps bleiben für Phase 3 (Showrooms) im Repo
//
// Pulse + Glow-Effekt ohne Post-Processing:
//   - Innere Sphere mit emissive Material (claimondo-light-blue)
//   - Äußere Halo-Sphere transparent mit oszillierender Opacity
//   - Beides scaled animiert (1.0-1.3) für Pulse-Atmung

import * as THREE from 'three'
import mapboxgl, { type Map as MapboxMap, type CustomLayerInterface } from 'mapbox-gl'

export const HERO_PIN_LAYER_ID = 'hero-pin-3d-layer'

export type HeroPin3dHandle = {
  /** Setzt neue Ziel-Position (z. B. wenn nächster Stop aktiv wird). */
  update: (lngLat: [number, number]) => void
  /** Entfernt den Layer. Idempotent. */
  remove: () => void
}

/**
 * Default-Pin-Höhe in Metern über dem Boden (Mercator-y-Achse).
 * 25 m wirkt visuell stimmig — der Pin schwebt sichtbar über Gebäuden,
 * verdeckt aber den Stop-Marker selbst nicht.
 */
const PIN_ALTITUDE_M = 25
/** Innere Sphere-Radius in Metern. */
const INNER_RADIUS_M = 8
/** Äußere Halo-Sphere-Radius in Metern. */
const OUTER_RADIUS_M = 14

const COLOR_GLOW = new THREE.Color('#7BA3CC') // claimondo-light-blue
const COLOR_HALO = new THREE.Color('#4573A2') // claimondo-ondo

/**
 * Legt den Hero-Pin als Custom-Layer in Mapbox an. Idempotent — wenn der
 * Layer schon existiert, wird er entfernt und neu angelegt.
 */
export function attachHeroPin3d(
  map: MapboxMap,
  lngLat: [number, number],
): HeroPin3dHandle {
  // Idempotent-Cleanup falls Hot-Reload-Reste.
  if (map.getLayer(HERO_PIN_LAYER_ID)) {
    try { map.removeLayer(HERO_PIN_LAYER_ID) } catch { /* noop */ }
  }

  const state = {
    target: lngLat,
    rafId: 0 as number,
    startTime: Date.now(),
  }

  // Refs zu den Three.js-Objekten — werden in onAdd befüllt.
  let scene: THREE.Scene | null = null
  let camera: THREE.Camera | null = null
  let renderer: THREE.WebGLRenderer | null = null
  let innerMesh: THREE.Mesh | null = null
  let haloMesh: THREE.Mesh | null = null
  let haloMaterial: THREE.MeshBasicMaterial | null = null

  function buildModelMatrix(lng: number, lat: number): THREE.Matrix4 {
    const origin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], PIN_ALTITUDE_M)
    const scale = origin.meterInMercatorCoordinateUnits()

    return new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      // glTF/Three.js y-up vs Mapbox z-up — Rotation um X-Achse 90°.
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2))
  }

  const customLayer: CustomLayerInterface = {
    id: HERO_PIN_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      camera = new THREE.Camera()
      scene = new THREE.Scene()

      // Ambient + directional light damit der Pin auch bei Nacht-Preset
      // sichtbar bleibt. Mapbox-Standard ändert die Map-Beleuchtung, aber
      // unser Pin soll konstant glühen.
      scene.add(new THREE.AmbientLight(0xffffff, 0.8))
      const dir = new THREE.DirectionalLight(0xffffff, 0.6)
      dir.position.set(0.5, 1, 0.5).normalize()
      scene.add(dir)

      // Innere Sphere — emissive Glow.
      const innerGeom = new THREE.SphereGeometry(INNER_RADIUS_M, 32, 16)
      const innerMat = new THREE.MeshStandardMaterial({
        color: COLOR_GLOW,
        emissive: COLOR_GLOW,
        emissiveIntensity: 1.6,
        metalness: 0.3,
        roughness: 0.4,
      })
      innerMesh = new THREE.Mesh(innerGeom, innerMat)
      scene.add(innerMesh)

      // Äußere Halo-Sphere — transparent, BackSide, soft glow.
      const haloGeom = new THREE.SphereGeometry(OUTER_RADIUS_M, 32, 16)
      haloMaterial = new THREE.MeshBasicMaterial({
        color: COLOR_HALO,
        transparent: true,
        opacity: 0.35,
        side: THREE.BackSide,
        depthWrite: false,
      })
      haloMesh = new THREE.Mesh(haloGeom, haloMaterial)
      scene.add(haloMesh)

      // Renderer teilt sich GL-Context mit Mapbox.
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      renderer.autoClear = false

      // Pulse-Animation: oscilliert zwischen scale 1.0 und 1.25 mit ~2 s
      // Periode. requestAnimationFrame — wir triggern beim Mapbox-Repaint
      // sowieso, aber das scale-Update braucht eigenen Tick.
      const tick = () => {
        if (!innerMesh || !haloMesh || !haloMaterial) return
        const t = (Date.now() - state.startTime) / 1000
        const phase = (Math.sin(t * Math.PI) + 1) / 2 // 0..1
        const scale = 1 + phase * 0.25
        innerMesh.scale.setScalar(scale)
        haloMesh.scale.setScalar(1 + phase * 0.4)
        haloMaterial.opacity = 0.25 + phase * 0.25
        map.triggerRepaint()
        state.rafId = window.requestAnimationFrame(tick)
      }
      state.rafId = window.requestAnimationFrame(tick)
    },

    // Mapbox v2 liefert `matrix: number[]` als zweiten Param, v3 liefert
    // ein RenderArgs-Object mit `defaultProjectionData.mainMatrix`. Wir
    // akzeptieren beide Shapes — der TypeScript-Type des Mapbox-CustomLayers
    // bildet die v3-Erweiterung noch nicht ab, daher unknown-Cast.
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

      const m = new THREE.Matrix4().fromArray(matrixArr)
      const l = buildModelMatrix(state.target[0], state.target[1])
      camera.projectionMatrix = m.multiply(l)

      renderer.resetState()
      renderer.render(scene, camera)
    },

    onRemove() {
      if (state.rafId) {
        window.cancelAnimationFrame(state.rafId)
        state.rafId = 0
      }
      // Geometrie + Materialien aufräumen.
      innerMesh?.geometry.dispose()
      ;(innerMesh?.material as THREE.Material | undefined)?.dispose()
      haloMesh?.geometry.dispose()
      haloMaterial?.dispose()
      scene = null
      camera = null
      // Renderer teilt sich GL-Context mit Mapbox — NICHT disposen, sonst
      // killt das die Map.
      renderer = null
      innerMesh = null
      haloMesh = null
      haloMaterial = null
    },
  }

  map.addLayer(customLayer)

  return {
    update(newLngLat: [number, number]) {
      state.target = newLngLat
      try { map.triggerRepaint() } catch { /* noop */ }
    },
    remove() {
      try {
        if (map.getLayer(HERO_PIN_LAYER_ID)) {
          map.removeLayer(HERO_PIN_LAYER_ID)
        }
      } catch { /* noop */ }
    },
  }
}
