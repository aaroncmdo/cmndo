// @ts-nocheck — three.js nicht installiert (Feldmodus-3D-Backlog)
'use client'

// 2026-05-08 (C12): Mapbox Custom-Layer mit Three.js für Wetter-Particles
// entlang der Route. Rendert pro WeatherRegion ein Particle-System:
//   - rain  → schräge dünne Linien-Streifen, schnelle Falling-Speed
//   - snow  → weiße Punkte, langsame Falling-Speed + Drift
//   - storm → Rain + zufällige Lightning-Quad-Flashes
//
// Architektur: ein einziger Custom-Layer, eine THREE.Scene — pro Region
// ein THREE.Group das wir bei `update()` neu aufbauen. Animation tickt
// in einem requestAnimationFrame-Loop, jeden Frame:
//   - Particles fallen, wrap-around bei Bottom
//   - Wind-Drift via Sinus-Phase (Snow nur)
//   - Lightning-Flashes random alle 2-5 s pro storm-Region
//
// Performance-Budget: max 8 Regionen × 600 Particles = 4800 Particles —
// auf modernem Mobile easy 60 fps.

import * as THREE from 'three'
import mapboxgl, { type Map as MapboxMap, type CustomLayerInterface } from 'mapbox-gl'
import type { WeatherRegion } from './weather-route'

export const WEATHER_FX_LAYER_ID = 'weather-fx-layer'

export type WeatherFxHandle = {
  update: (regions: WeatherRegion[]) => void
  remove: () => void
}

const PARTICLES_PER_REGION = 600
const REGION_CYLINDER_HEIGHT_M = 250
const SNOW_FALL_SPEED_M_PER_S = 1.5
const RAIN_FALL_SPEED_M_PER_S = 18
const SNOW_DRIFT_AMPLITUDE_M = 12
const STORM_LIGHTNING_INTERVAL_MIN_MS = 2500
const STORM_LIGHTNING_INTERVAL_MAX_MS = 5500
const STORM_LIGHTNING_DURATION_MS = 130

type RegionRender = {
  region: WeatherRegion
  group: THREE.Group
  /** Particle-Render — entweder Points (Snow) oder LineSegments (Rain). */
  particles: THREE.Object3D | null
  lightning: THREE.Mesh | null
  /** Initial-Y-Position für jeden Particle (random spread). */
  initialY: Float32Array
  /** Random-Drift-Phase pro Particle (Snow). */
  driftPhase: Float32Array
  /** Nächster Lightning-Trigger-ts (Date.now()). */
  nextLightningAt: number
  /** Falls Lightning gerade aktiv: end-ts. */
  lightningEndsAt: number
}

function buildModelMatrix(lng: number, lat: number, altitudeM: number): THREE.Matrix4 {
  const origin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitudeM)
  const scale = origin.meterInMercatorCoordinateUnits()
  return new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .scale(new THREE.Vector3(scale, -scale, scale))
    .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2))
}

function makeSnowGeometry(radiusM: number): { geom: THREE.BufferGeometry; initialY: Float32Array; driftPhase: Float32Array } {
  const geom = new THREE.BufferGeometry()
  const positions = new Float32Array(PARTICLES_PER_REGION * 3)
  const initialY = new Float32Array(PARTICLES_PER_REGION)
  const driftPhase = new Float32Array(PARTICLES_PER_REGION)
  for (let i = 0; i < PARTICLES_PER_REGION; i++) {
    // Random Pos in einem Zylinder mit gegebenem Radius, Höhe = REGION_CYLINDER_HEIGHT_M
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * radiusM
    positions[i * 3] = Math.cos(a) * r
    positions[i * 3 + 1] = Math.random() * REGION_CYLINDER_HEIGHT_M
    positions[i * 3 + 2] = Math.sin(a) * r
    initialY[i] = positions[i * 3 + 1]
    driftPhase[i] = Math.random() * Math.PI * 2
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return { geom, initialY, driftPhase }
}

function makeRainGeometry(radiusM: number): { geom: THREE.BufferGeometry; initialY: Float32Array; driftPhase: Float32Array } {
  // Rain wird als kurze Linien gerendert (LineSegments). Pro Particle
  // zwei Vertices: Top + Bottom. Wir cheaten: positions[i*6]..[i*6+5].
  const geom = new THREE.BufferGeometry()
  const RAIN_LINE_LEN_M = 4
  const positions = new Float32Array(PARTICLES_PER_REGION * 6)
  const initialY = new Float32Array(PARTICLES_PER_REGION)
  const driftPhase = new Float32Array(PARTICLES_PER_REGION)
  for (let i = 0; i < PARTICLES_PER_REGION; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * radiusM
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const y = Math.random() * REGION_CYLINDER_HEIGHT_M
    positions[i * 6] = x
    positions[i * 6 + 1] = y
    positions[i * 6 + 2] = z
    positions[i * 6 + 3] = x + 0.4
    positions[i * 6 + 4] = y - RAIN_LINE_LEN_M
    positions[i * 6 + 5] = z
    initialY[i] = y
    driftPhase[i] = Math.random()
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return { geom, initialY, driftPhase }
}

function makeLightningPlane(radiusM: number): THREE.Mesh {
  // Großes flaches Quad zentriert über der Region. Material additive,
  // opacity 0 standardmäßig — wird beim Lightning-Flash kurz auf 0.6
  // gepusht.
  const geom = new THREE.PlaneGeometry(radiusM * 2, radiusM * 2)
  geom.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff3a0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.position.y = REGION_CYLINDER_HEIGHT_M / 2
  return mesh
}

function buildRegionRender(region: WeatherRegion): RegionRender {
  const group = new THREE.Group()
  let particles: THREE.Points | null = null
  let lineSegs: THREE.LineSegments | null = null
  let lightning: THREE.Mesh | null = null
  let initialY: Float32Array = new Float32Array(0)
  let driftPhase: Float32Array = new Float32Array(0)

  if (region.type === 'snow') {
    const { geom, initialY: iy, driftPhase: dp } = makeSnowGeometry(region.radiusM)
    initialY = iy
    driftPhase = dp
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.4,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    })
    particles = new THREE.Points(geom, mat)
    group.add(particles)
  } else if (region.type === 'rain' || region.type === 'storm') {
    const { geom, initialY: iy, driftPhase: dp } = makeRainGeometry(region.radiusM)
    initialY = iy
    driftPhase = dp
    const mat = new THREE.LineBasicMaterial({
      color: region.type === 'storm' ? 0x6188c4 : 0x88b4f0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
    lineSegs = new THREE.LineSegments(geom, mat)
    group.add(lineSegs)
    if (region.type === 'storm') {
      lightning = makeLightningPlane(region.radiusM)
      group.add(lightning)
    }
  }

  return {
    region,
    group,
    particles: lineSegs ?? particles,
    lightning,
    initialY,
    driftPhase,
    nextLightningAt: Date.now() + STORM_LIGHTNING_INTERVAL_MIN_MS + Math.random() * 2000,
    lightningEndsAt: 0,
  }
}

export function attachWeatherFx(map: MapboxMap): WeatherFxHandle {
  let scene: THREE.Scene | null = null
  let camera: THREE.Camera | null = null
  let renderer: THREE.WebGLRenderer | null = null
  let renders: RegionRender[] = []
  let rafId = 0
  let lastTickAt = Date.now()

  function tick() {
    const now = Date.now()
    const dtSec = Math.min(0.1, (now - lastTickAt) / 1000)
    lastTickAt = now

    for (const r of renders) {
      if (r.region.type === 'snow' && r.particles) {
        const points = r.particles as THREE.Points
        const pos = (points.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
        for (let i = 0; i < PARTICLES_PER_REGION; i++) {
          // Y absteigen, X drift (Sinus)
          pos[i * 3 + 1] -= SNOW_FALL_SPEED_M_PER_S * dtSec
          if (pos[i * 3 + 1] < 0) {
            pos[i * 3 + 1] = REGION_CYLINDER_HEIGHT_M
          }
          const phase = r.driftPhase[i] + now / 1000 / 4
          pos[i * 3] += Math.sin(phase) * SNOW_DRIFT_AMPLITUDE_M * dtSec * 0.05
        }
        ;(points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      } else if ((r.region.type === 'rain' || r.region.type === 'storm') && r.particles) {
        const lines = r.particles as THREE.LineSegments
        const pos = (lines.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
        for (let i = 0; i < PARTICLES_PER_REGION; i++) {
          // Linie hat 2 Vertices — beide nach unten bewegen
          const newY1 = pos[i * 6 + 1] - RAIN_FALL_SPEED_M_PER_S * dtSec
          const newY2 = pos[i * 6 + 4] - RAIN_FALL_SPEED_M_PER_S * dtSec
          if (newY2 < 0) {
            // Wrap-around top
            const a = Math.random() * Math.PI * 2
            const radiusM = r.region.radiusM
            const newR = Math.sqrt(Math.random()) * radiusM
            const x = Math.cos(a) * newR
            const z = Math.sin(a) * newR
            const y = REGION_CYLINDER_HEIGHT_M
            pos[i * 6] = x
            pos[i * 6 + 1] = y
            pos[i * 6 + 2] = z
            pos[i * 6 + 3] = x + 0.4
            pos[i * 6 + 4] = y - 4
            pos[i * 6 + 5] = z
          } else {
            pos[i * 6 + 1] = newY1
            pos[i * 6 + 4] = newY2
          }
        }
        ;(lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

        // Lightning-Trigger
        if (r.region.type === 'storm' && r.lightning) {
          const mat = r.lightning.material as THREE.MeshBasicMaterial
          if (now < r.lightningEndsAt) {
            const ratio = (r.lightningEndsAt - now) / STORM_LIGHTNING_DURATION_MS
            mat.opacity = 0.6 * ratio
          } else if (now >= r.nextLightningAt) {
            r.lightningEndsAt = now + STORM_LIGHTNING_DURATION_MS
            r.nextLightningAt =
              now + STORM_LIGHTNING_INTERVAL_MIN_MS +
              Math.random() * (STORM_LIGHTNING_INTERVAL_MAX_MS - STORM_LIGHTNING_INTERVAL_MIN_MS)
          } else {
            mat.opacity = 0
          }
        }
      }
    }
    map.triggerRepaint()
    rafId = window.requestAnimationFrame(tick)
  }

  const customLayer: CustomLayerInterface = {
    id: WEATHER_FX_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd(_map, gl) {
      camera = new THREE.Camera()
      scene = new THREE.Scene()
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      renderer.autoClear = false
      lastTickAt = Date.now()
      rafId = window.requestAnimationFrame(tick)
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

      // Pro Region: deren Group an die geographische Position positionieren
      // und mit projection-Matrix rendern. Da wir mehrere Regionen haben,
      // setzen wir camera.projectionMatrix pro Region neu.
      const projection = new THREE.Matrix4().fromArray(matrixArr)
      renderer.resetState()
      for (const r of renders) {
        const localScene = new THREE.Scene()
        localScene.add(r.group)
        const local = buildModelMatrix(r.region.center[0], r.region.center[1], 0)
        camera.projectionMatrix = projection.clone().multiply(local)
        renderer.render(localScene, camera)
        // Group wieder rauspoppen damit wir sie nicht mehrfach in Scenes
        // haben (Three.js limitation: Object.parent muss eindeutig sein).
        localScene.remove(r.group)
      }
    },

    onRemove() {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
      for (const r of renders) {
        (r.particles as THREE.Points | THREE.LineSegments | null)?.geometry.dispose()
        ;((r.particles as THREE.Points | THREE.LineSegments | null)?.material as THREE.Material | undefined)?.dispose()
        r.lightning?.geometry.dispose()
        ;(r.lightning?.material as THREE.Material | undefined)?.dispose()
      }
      renders = []
      scene = null
      camera = null
      renderer = null
    },
  }

  map.addLayer(customLayer)

  return {
    update(regions: WeatherRegion[]) {
      // Diff: easy approach — alle alten Renders disposen, neu bauen.
      // Wetter-Updates kommen selten (jedes Reroute oder GPS-Sprung).
      for (const r of renders) {
        (r.particles as THREE.Points | THREE.LineSegments | null)?.geometry.dispose()
        ;((r.particles as THREE.Points | THREE.LineSegments | null)?.material as THREE.Material | undefined)?.dispose()
        r.lightning?.geometry.dispose()
        ;(r.lightning?.material as THREE.Material | undefined)?.dispose()
      }
      renders = regions.filter((reg) => reg.type !== 'clear').map((reg) => buildRegionRender(reg))
      try { map.triggerRepaint() } catch { /* noop */ }
    },
    remove() {
      try {
        if (map.getLayer(WEATHER_FX_LAYER_ID)) map.removeLayer(WEATHER_FX_LAYER_ID)
      } catch { /* noop */ }
    },
  }
}
