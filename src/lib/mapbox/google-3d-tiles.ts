'use client'

// 2026-05-07 Phase 4 (feldmodus-mapbox-3d-roadmap.md):
// Google Photorealistic 3D Tiles via deck.gl Tile3DLayer + MapboxOverlay.
//
// Liefert echte fotogrammetrische Mesh-Daten von Großstädten (Berlin,
// München, Hamburg, Köln, Frankfurt …) statt der grauen Mapbox-Standard-
// Boxen. Premium-Look ohne eigene Asset-Pipeline.
//
// **WICHTIG — Cost-Profil:**
//   - Google Maps Platform 3D Tiles: ~$10 pro 1000 Tile-Requests
//   - Pro Map-View → ~50-200 Tile-Requests (abhängig von Zoom + Schwenk)
//   - Aktivierung **nur über Env-Vars** — Default ist OFF.
//
// Aktivierung:
//   1. NEXT_PUBLIC_GOOGLE_MAPS_3D_TILES_KEY = <Google-Maps-API-Key mit
//      Photorealistic-3D-Tiles-Berechtigung>
//   2. NEXT_PUBLIC_FELDMODUS_GOOGLE_TILES = "true"
//
// Wenn beide gesetzt sind, wird der Layer automatisch im Feldmodus
// attached. Sonst no-op.

import type { Map as MapboxMap } from 'mapbox-gl'

const GOOGLE_TILES_URL = (key: string) =>
  `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(key)}`

export type Google3dTilesHandle = {
  /** Entfernt den deck.gl-Overlay wieder. Idempotent. */
  remove: () => void
}

/**
 * Liefert true wenn beide Env-Vars für Google 3D Tiles gesetzt sind.
 * Auf der Server-Seite immer false (Mapbox läuft client-side).
 */
export function isGoogle3dTilesEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const flag = process.env.NEXT_PUBLIC_FELDMODUS_GOOGLE_TILES
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_3D_TILES_KEY
  return flag === 'true' && !!key
}

/**
 * Attached den Google-3D-Tiles-Layer als deck.gl-Overlay an die Mapbox-
 * Karte. Lazy-Import damit deck.gl + loaders.gl nicht ins initial Bundle
 * gehen wenn die Feature deaktiviert ist.
 */
export async function attachGoogle3dTiles(
  map: MapboxMap,
): Promise<Google3dTilesHandle | null> {
  if (!isGoogle3dTilesEnabled()) return null

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_3D_TILES_KEY!
  try {
    const [{ MapboxOverlay }, { Tile3DLayer }, { CesiumIonLoader, Tiles3DLoader }] = await Promise.all([
      import('@deck.gl/mapbox'),
      import('@deck.gl/geo-layers'),
      import('@loaders.gl/3d-tiles'),
    ])
    // Google 3D Tiles nutzen den Cesium-Tiles-Loader (Tiles3DLoader). Wir
    // setzen den Loader explizit damit Tree-Shaking nicht überrascht.
    void CesiumIonLoader

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [
        new Tile3DLayer({
          id: 'google-3d-tiles',
          data: GOOGLE_TILES_URL(apiKey),
          loader: Tiles3DLoader,
          // Subtile Klang-Eigenschaften: keine Click-Outline, dezenter
          // Pick-Highlight nur falls jemand Click-Handler hinzufügt.
          pickable: false,
        }),
      ],
    })

    // mapbox-gl IControl-Type ist mit deck.gl-MapboxOverlay strukturell
    // kompatibel — der deck.gl-Type spezifiziert `onAdd/onRemove` mit
    // einem `Map`-Generic, mapbox-gl erwartet ein konkretes Map-Argument.
    // Hier ist ein bewusster Cast nötig.
    map.addControl(overlay as unknown as Parameters<typeof map.addControl>[0])

    return {
      remove() {
        try {
          map.removeControl(overlay as unknown as Parameters<typeof map.removeControl>[0])
        } catch { /* idempotent */ }
      },
    }
  } catch (err) {
    console.error('[google-3d-tiles] attach failed', err)
    return null
  }
}
