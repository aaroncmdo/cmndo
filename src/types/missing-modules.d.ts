// Typ-Stubs für @deck.gl/* und @loaders.gl/* — kein eigenes @types-Paket.
// three + @types/three sind installiert und brauchen keinen Stub mehr.
// deck.gl-Packages werden ebenfalls als Peer-Dependencies nachgezogen
// und hier nur als minimal-Stub gehalten bis vollständige Typen geprüft sind.

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
