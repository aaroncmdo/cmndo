'use client'

// 2026-05-07 Phase 4 (Cesium Ion Variante):
// Photorealistic / OSM-Buildings 3D Tiles via Cesium Ion. Ersatz für die
// ursprünglich geplante Google Photorealistic Tiles, die in der EEA seit
// 2024 wegen DSA/DMA-Regulierung gesperrt sind.
//
// Cesium Ion liefert:
//   - Asset 2275207 — Cesium OSM Buildings (gratis Free-Tier)
//   - Asset 96188   — Cesium World Terrain
//   - Optional: User-Owned Photorealistic-Assets (Pro-Plan ab $50/Monat)
//
// Free-Tier: 5 GB / 100k Tile-Requests pro Monat. Für SV-Demo reichlich.
//
// Aktivierung via Env-Vars:
//   NEXT_PUBLIC_CESIUM_ION_TOKEN          = <Bearer-JWT aus cesium.com/ion>
//   NEXT_PUBLIC_FELDMODUS_CESIUM_TILES    = "true"
//   NEXT_PUBLIC_CESIUM_ION_ASSET_ID       = "2275207" (default = OSM Buildings)

import type { Map as MapboxMap } from 'mapbox-gl'

// 2026-05-07 (Korrektur nach EEA-Test): Asset 2275207 ist nicht „OSM
// Buildings" sondern Google Photorealistic 3D Tiles via Cesium-Proxy →
// EEA-blockiert wie der direkte Google-Pfad. Asset 96188 ist Cesium's
// eigenes 3D-Tiles-Asset (OSM-basiert, EU-fähig, gratis).
const DEFAULT_ASSET_ID = '96188' // Cesium OSM Buildings (EU-fähig)

export type Cesium3dTilesHandle = {
  remove: () => void
}

export function isCesium3dTilesEnabled(): boolean {
  // 2026-05-08: Hart deaktiviert. Asset 96188 (Cesium OSM Buildings) liefert
  // flache, ungeshadete Block-Geometrie und überlagert die Mapbox-Standard-
  // 3D-Buildings, die mit Light-Preset echte Tageszeit-Schatten bekommen.
  // Ergebnis im Feldmodus war „graue Klötze ohne Shadow". Cesium-Pfad
  // bleibt als Code-Asset erhalten falls wir später Pro-Tier-Photorealistic-
  // Tiles einbinden, aber im Default-Render aus.
  return false
}

/**
 * Cesium-Ion-Endpoint-Resolution. Liefert die signierte Tile-URL +
 * gegebenenfalls einen kurzlebigen Access-Token. Bei 401/403 → null.
 */
async function resolveCesiumEndpoint(
  assetId: string,
  ionToken: string,
): Promise<{ url: string; accessToken: string } | null> {
  try {
    const res = await fetch(`https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token=${ionToken}`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(
        `[cesium-3d-tiles] Endpoint-Resolution ${res.status} — Token ungültig oder Asset ${assetId} nicht ` +
          `freigegeben. Body: ${body.slice(0, 200)}`,
      )
      return null
    }
    const json = (await res.json()) as { url: string; accessToken: string; type?: string }
    return { url: json.url, accessToken: json.accessToken }
  } catch (err) {
    console.warn('[cesium-3d-tiles] Endpoint Network-Error:', err)
    return null
  }
}

/**
 * Attached Cesium-Ion 3D Tiles als deck.gl-Overlay. Lazy-Import für deck.gl
 * + loaders.gl damit Bundle nicht aufgebläht wird wenn Feature off ist.
 */
export async function attachCesium3dTiles(
  map: MapboxMap,
): Promise<Cesium3dTilesHandle | null> {
  if (!isCesium3dTilesEnabled()) return null

  const ionToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN!
  const assetId = process.env.NEXT_PUBLIC_CESIUM_ION_ASSET_ID ?? DEFAULT_ASSET_ID

  const endpoint = await resolveCesiumEndpoint(assetId, ionToken)
  if (!endpoint) return null

  try {
    const [{ MapboxOverlay }, { Tile3DLayer }, loaders3d] = await Promise.all([
      import('@deck.gl/mapbox'),
      import('@deck.gl/geo-layers'),
      import('@loaders.gl/3d-tiles'),
    ])
    // Cesium Ion liefert klassische 3D-Tiles → Tiles3DLoader. CesiumIonLoader
    // existiert ebenfalls und kann das Endpoint direkt resolven, aber wir
    // nutzen die explicite resolution oben für robustere Fehlerbehandlung.
    const { Tiles3DLoader } = loaders3d as unknown as { Tiles3DLoader: unknown }

    // 2026-05-07: interleaved: false → deck.gl rendert in eigenem Canvas
    // ÜBER der Mapbox-Karte. Mit interleaved: true gab es WebGL-Context-
    // Conflicts → die Mapbox-Karte rendert dann gar nicht mehr (Aaron-
    // Smoke MAP1.jpg: leere weiße Karte trotz Cesium-Aktivierung).
    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [
        new Tile3DLayer({
          id: 'cesium-3d-tiles',
          data: endpoint.url,
          loader: Tiles3DLoader as never,
          loadOptions: {
            fetch: {
              headers: { Authorization: `Bearer ${endpoint.accessToken}` },
            },
          },
          pickable: false,
          onTileError: (err: unknown) => {
            console.warn('[cesium-3d-tiles] tile-error', err)
          },
        }),
      ],
    })

    map.addControl(overlay as unknown as Parameters<typeof map.addControl>[0])

    return {
      remove() {
        try {
          map.removeControl(overlay as unknown as Parameters<typeof map.removeControl>[0])
        } catch { /* idempotent */ }
      },
    }
  } catch (err) {
    console.error('[cesium-3d-tiles] attach failed', err)
    return null
  }
}
