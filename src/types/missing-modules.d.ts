// Typ-Stubs für @deck.gl/* und @loaders.gl/*.
// Diese Packages haben zu viele Typ-Abhängigkeiten für den CI-Build (OOM).
// Die Dateien die sie nutzen (cesium-3d-tiles, google-3d-tiles) haben @ts-nocheck.
// Stubs sind nur Defense-in-Depth falls ein anderer Import die Module referenziert.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor = new (...args: any[]) => any

declare module '@deck.gl/mapbox' {
  export const MapboxOverlay: AnyConstructor
}

declare module '@deck.gl/geo-layers' {
  export const Tile3DLayer: AnyConstructor
}

declare module '@loaders.gl/3d-tiles' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Tiles3DLoader: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const CesiumIonLoader: any
}
