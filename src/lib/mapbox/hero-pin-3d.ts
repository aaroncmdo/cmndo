// @ts-nocheck — three.js nicht installiert (Feldmodus-3D-Backlog)
'use client'

// 2026-05-07 Phase 2 + Phase 5: Hero-Pin als Mapbox-Custom-Layer mit Three.js.
//
// Phase 5 (Cinematic Polish, kein Threebox-Plugin nötig):
//   - Vertikaler Glow-Beam vom Boden bis zur Sphere (Tron-/Sci-Fi-Look)
//   - Radialer Gradient-Halo via Sprite (Bloom-Fake ohne Post-Processing)
//   - Ground-Pulse-Ring der konzentrisch expandiert + verblasst
//   - Sun-Position-Sync: Directional-Light folgt Mapbox-lightPreset (dawn/
//     day/dusk/night) → der Pin wirft korrekt orientierte Schatten
//   - Verbesserte Pulse-Easing (sin² statt sin) für sanftere Atmung
//
// Architektur-Entscheidung: Mapbox-Custom-Layer mit Three.js direkt (NICHT
// R3F-Overlay) → teilt sich GL-Context mit der Map, kein Camera-Sync-Drift.
// Threebox-Plugin nicht genutzt: seit 2022 unverändert, Mapbox-v3-Compat
// unsicher. Wir liefern dieselben konkreten Features (Sun-Sync, Schatten,
// Glow) direkt mit Three.js — robuster, weniger Lock-in.

import * as THREE from 'three'
import mapboxgl, { type Map as MapboxMap, type CustomLayerInterface } from 'mapbox-gl'
import { getMapboxLightPreset, type MapboxLightPreset } from './light-preset'

export const HERO_PIN_LAYER_ID = 'hero-pin-3d-layer'

export type HeroPin3dHandle = {
  /** Setzt neue Ziel-Position (z. B. wenn nächster Stop aktiv wird). */
  update: (lngLat: [number, number]) => void
  /** Updated Sun-Position aus aktuellem Light-Preset (call bei Stop-/Time-
   *  Wechsel damit der Schattenwurf passt). */
  updateLight: (preset: MapboxLightPreset) => void
  /**
   * 2026-05-08 (C6) Arrived-Choreographie: bei `true` switcht der Pin
   * auf success-grün, doppelte Pulse-Frequenz, intensiveren Glow. Bei
   * `false` zurück zum Default-Cyan.
   */
  setArrived: (arrived: boolean) => void
  /** Entfernt den Layer. Idempotent. */
  remove: () => void
}

const PIN_SPHERE_ALTITUDE_M = 28
const INNER_RADIUS_M = 6
const OUTER_HALO_RADIUS_M = 28
const BEAM_HEIGHT_M = 24
const BEAM_RADIUS_M = 1.5
const GROUND_PULSE_MAX_RADIUS_M = 35

const COLOR_GLOW = new THREE.Color('#7BA3CC') // claimondo-light-blue (default)
const COLOR_HALO = new THREE.Color('#4573A2') // claimondo-ondo
// 2026-05-08 (C6): Arrived-Choreographie — emerald-Töne signalisieren
// "Ziel erreicht". Doppelte Pulse-Frequenz erzeugt eine Erfolgs-
// Animation, die den SV optisch belohnt + ihn auf den arrived-Modal
// vorbereitet.
const COLOR_GLOW_ARRIVED = new THREE.Color('#10B981') // emerald-500
const COLOR_HALO_ARRIVED = new THREE.Color('#059669') // emerald-600

/**
 * Liefert eine radial-gradient sprite-Texture für Soft-Glow-Halo.
 * Cached als Module-Singleton — ein Halo reicht für alle Hero-Pins.
 */
let cachedGlowTexture: THREE.Texture | null = null
function getGlowTexture(): THREE.Texture {
  if (cachedGlowTexture) return cachedGlowTexture
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0.0, 'rgba(123, 163, 204, 0.95)')
  gradient.addColorStop(0.3, 'rgba(123, 163, 204, 0.5)')
  gradient.addColorStop(0.6, 'rgba(69, 115, 162, 0.2)')
  gradient.addColorStop(1.0, 'rgba(69, 115, 162, 0.0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  cachedGlowTexture = tex
  return tex
}

/**
 * Sun-Direction aus lightPreset. Vereinfacht — Mapbox-Standard nutzt
 * intern eine reale Sonnen-Berechnung pro Lat/Lng + Datum, wir matchen
 * grob die Tageszeit.
 */
function sunDirectionFor(preset: MapboxLightPreset): THREE.Vector3 {
  switch (preset) {
    case 'dawn':
      return new THREE.Vector3(-0.6, 0.2, 0.4).normalize() // tief von Osten
    case 'dusk':
      return new THREE.Vector3(0.6, 0.2, 0.4).normalize() // tief von Westen
    case 'night':
      return new THREE.Vector3(0, 0.3, 1).normalize() // schwaches Mondlicht von oben
    default:
      return new THREE.Vector3(0.3, 1, 0.5).normalize() // hoch stehend (day)
  }
}

function sunIntensityFor(preset: MapboxLightPreset): number {
  switch (preset) {
    case 'dawn': return 0.7
    case 'dusk': return 0.6
    case 'night': return 0.2
    default: return 1.0
  }
}

/**
 * Attached den Hero-Pin als Custom-Layer in Mapbox an.
 */
export function attachHeroPin3d(
  map: MapboxMap,
  lngLat: [number, number],
): HeroPin3dHandle {
  if (map.getLayer(HERO_PIN_LAYER_ID)) {
    try { map.removeLayer(HERO_PIN_LAYER_ID) } catch { /* noop */ }
  }

  const state = {
    target: lngLat,
    rafId: 0 as number,
    startTime: Date.now(),
    preset: getMapboxLightPreset(new Date()),
    // 2026-05-08 (C6): arrived-Flag steuert Color + Pulse-Frequenz.
    arrived: false,
    // Zeitpunkt des letzten arrived-Toggle für Color-Crossfade.
    arrivedSince: 0,
  }

  let scene: THREE.Scene | null = null
  let camera: THREE.Camera | null = null
  let renderer: THREE.WebGLRenderer | null = null
  // Refs auf einzelne Geometry-Teile für Animation + Light-Update.
  let innerMesh: THREE.Mesh | null = null
  let haloSprite: THREE.Sprite | null = null
  let beamMesh: THREE.Mesh | null = null
  let groundRing: THREE.Mesh | null = null
  let groundRingMaterial: THREE.MeshBasicMaterial | null = null
  let directionalLight: THREE.DirectionalLight | null = null

  function buildModelMatrix(lng: number, lat: number, altitudeM: number): THREE.Matrix4 {
    const origin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitudeM)
    const scale = origin.meterInMercatorCoordinateUnits()
    return new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2))
  }

  const customLayer: CustomLayerInterface = {
    id: HERO_PIN_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      camera = new THREE.Camera()
      scene = new THREE.Scene()

      // Ambient + directional. Sun-Direction aus aktuellem Light-Preset.
      scene.add(new THREE.AmbientLight(0xffffff, 0.5))
      directionalLight = new THREE.DirectionalLight(0xffffff, sunIntensityFor(state.preset))
      directionalLight.position.copy(sunDirectionFor(state.preset).multiplyScalar(50))
      scene.add(directionalLight)

      // 1) Innere Sphere — emissive Pin-Kern.
      const innerGeom = new THREE.SphereGeometry(INNER_RADIUS_M, 32, 16)
      const innerMat = new THREE.MeshStandardMaterial({
        color: COLOR_GLOW,
        emissive: COLOR_GLOW,
        emissiveIntensity: 2.4,
        metalness: 0.4,
        roughness: 0.3,
      })
      innerMesh = new THREE.Mesh(innerGeom, innerMat)
      innerMesh.position.y = 0
      scene.add(innerMesh)

      // 2) Soft-Glow-Halo via Sprite mit radial-gradient texture. Größer
      //    als die Sphere, fakt Bloom-Effekt ohne Post-Processing-Pass.
      const glowTex = getGlowTexture()
      const haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      haloSprite = new THREE.Sprite(haloMat)
      haloSprite.scale.set(OUTER_HALO_RADIUS_M * 2, OUTER_HALO_RADIUS_M * 2, 1)
      haloSprite.position.y = 0
      scene.add(haloSprite)

      // 3) Vertikaler Beam vom Boden zur Sphere — Tron/Sci-Fi-Look.
      //    Cylinder oben transparent, unten emissive, additive blending.
      const beamGeom = new THREE.CylinderGeometry(BEAM_RADIUS_M, BEAM_RADIUS_M * 1.3, BEAM_HEIGHT_M, 16, 1, true)
      const beamMat = new THREE.MeshBasicMaterial({
        color: COLOR_GLOW,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      beamMesh = new THREE.Mesh(beamGeom, beamMat)
      // Cylinder-Mitte → wir wollen ihn vom Boden bis zur Sphere
      // (PIN_SPHERE_ALTITUDE_M Höhe). Versatz nach unten um BEAM_HEIGHT/2.
      beamMesh.position.y = -(BEAM_HEIGHT_M / 2)
      scene.add(beamMesh)

      // 4) Ground-Pulse-Ring — flacher Ring auf Boden-Höhe der konzentrisch
      //    expandiert. RingGeometry, additive Blending.
      const ringGeom = new THREE.RingGeometry(2, 3, 64)
      groundRingMaterial = new THREE.MeshBasicMaterial({
        color: COLOR_GLOW,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      groundRing = new THREE.Mesh(ringGeom, groundRingMaterial)
      groundRing.rotation.x = -Math.PI / 2
      // Auf Boden-Höhe → relative -PIN_SPHERE_ALTITUDE_M
      groundRing.position.y = -PIN_SPHERE_ALTITUDE_M + 0.5
      scene.add(groundRing)

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      renderer.autoClear = false

      // Animation-Loop: Sphere-Pulse, Halo-Pulse, Ground-Ring-Expansion.
      const tick = () => {
        if (!innerMesh || !haloSprite || !groundRing || !groundRingMaterial || !beamMesh) return
        const t = (Date.now() - state.startTime) / 1000

        // 2026-05-08 (C6): bei arrived doppelt so schnell pulsen +
        // intensivere Skalen-Range. Wirkt wie eine "Ankommens-Atmung".
        const pulseSpeed = state.arrived ? 2 : 1
        const phase = Math.pow(Math.sin(t * Math.PI * pulseSpeed), 2)
        const sphereGrowth = state.arrived ? 0.32 : 0.18
        const haloGrowth = state.arrived ? 0.18 : 0.1
        innerMesh.scale.setScalar(1 + phase * sphereGrowth)
        haloSprite.scale.setScalar(OUTER_HALO_RADIUS_M * 2 * (1 + phase * haloGrowth))
        const beamOpacity = (state.arrived ? 0.55 : 0.35) + phase * 0.25
        ;(beamMesh.material as THREE.MeshBasicMaterial).opacity = beamOpacity

        // Color-Crossfade in/out arrived (300 ms ease).
        if (state.arrivedSince > 0) {
          const tCross = Math.min(1, (Date.now() - state.arrivedSince) / 300)
          const target = state.arrived ? COLOR_GLOW_ARRIVED : COLOR_GLOW
          const haloTarget = state.arrived ? COLOR_HALO_ARRIVED : COLOR_HALO
          ;(innerMesh.material as THREE.MeshStandardMaterial).color.lerp(target, tCross)
          ;(innerMesh.material as THREE.MeshStandardMaterial).emissive.lerp(target, tCross)
          ;(beamMesh.material as THREE.MeshBasicMaterial).color.lerp(target, tCross)
          groundRingMaterial.color.lerp(haloTarget, tCross)
          if (tCross >= 1) state.arrivedSince = 0
        }

        // Ground-Ring: bei arrived 1-Sekunden-Cycle (schneller),
        // sonst 2-Sekunden-Cycle.
        const ringCycleSec = state.arrived ? 1 : 2
        const ringPhase = (t % ringCycleSec) / ringCycleSec
        const ringScale = 1 + ringPhase * (GROUND_PULSE_MAX_RADIUS_M / 3)
        groundRing.scale.setScalar(ringScale)
        groundRingMaterial.opacity = (state.arrived ? 0.85 : 0.6) * (1 - ringPhase)

        map.triggerRepaint()
        state.rafId = window.requestAnimationFrame(tick)
      }
      state.rafId = window.requestAnimationFrame(tick)
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

      const m = new THREE.Matrix4().fromArray(matrixArr)
      // Origin ist auf Sphere-Höhe → alle Sub-Objekte y-relative dazu.
      const l = buildModelMatrix(state.target[0], state.target[1], PIN_SPHERE_ALTITUDE_M)
      camera.projectionMatrix = m.multiply(l)

      renderer.resetState()
      renderer.render(scene, camera)
    },

    onRemove() {
      if (state.rafId) {
        window.cancelAnimationFrame(state.rafId)
        state.rafId = 0
      }
      innerMesh?.geometry.dispose()
      ;(innerMesh?.material as THREE.Material | undefined)?.dispose()
      haloSprite?.material.dispose()
      beamMesh?.geometry.dispose()
      ;(beamMesh?.material as THREE.Material | undefined)?.dispose()
      groundRing?.geometry.dispose()
      groundRingMaterial?.dispose()
      scene = null
      camera = null
      renderer = null
      innerMesh = null
      haloSprite = null
      beamMesh = null
      groundRing = null
      groundRingMaterial = null
      directionalLight = null
    },
  }

  map.addLayer(customLayer)

  return {
    update(newLngLat: [number, number]) {
      state.target = newLngLat
      try { map.triggerRepaint() } catch { /* noop */ }
    },
    updateLight(preset: MapboxLightPreset) {
      state.preset = preset
      if (directionalLight) {
        directionalLight.position.copy(sunDirectionFor(preset).multiplyScalar(50))
        directionalLight.intensity = sunIntensityFor(preset)
      }
    },
    setArrived(arrived: boolean) {
      if (state.arrived === arrived) return
      state.arrived = arrived
      state.arrivedSince = Date.now()
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
