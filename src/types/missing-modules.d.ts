// Typ-Stubs für optionale 3D-Pakete (drei, deck.gl, loaders.gl).
// Diese werden nur im Feldmodus-3D-Feature genutzt — lazy-geladen oder
// bei Bedarf. Die echten Packages werden installiert sobald das Feature
// produktionsreif ist (AAR-8xx Backlog).

declare module 'three' {
  export const WebGLRenderer: unknown
  export const Scene: unknown
  export const PerspectiveCamera: unknown
  export const AmbientLight: unknown
  export const DirectionalLight: unknown
  export const MeshStandardMaterial: unknown
  export const Mesh: unknown
  export const BoxGeometry: unknown
  export const SphereGeometry: unknown
  export const Group: unknown
  export const Vector3: unknown
  export const Quaternion: unknown
  export const Matrix4: unknown
  export const Color: unknown
  export const TextureLoader: unknown
  export const PMREMGenerator: unknown
  export const RGBAFormat: unknown
  export const HalfFloatType: unknown
  export const Clock: unknown
  export const MathUtils: unknown
  export const MeshPhongMaterial: unknown
  export const MeshLambertMaterial: unknown
  export const Float32BufferAttribute: unknown
  export const BufferGeometry: unknown
  export const Points: unknown
  export const PointsMaterial: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const THREE: any
  export default THREE
}

declare module 'three/examples/jsm/loaders/OBJLoader.js' {
  export const OBJLoader: unknown
}

declare module 'three/examples/jsm/loaders/RGBELoader.js' {
  export const RGBELoader: unknown
}

declare module '@deck.gl/mapbox' {
  export const MapboxOverlay: unknown
}

declare module '@deck.gl/geo-layers' {
  export const Tile3DLayer: unknown
}

declare module '@loaders.gl/3d-tiles' {
  export const Tiles3DLoader: unknown
  export const CesiumIonLoader: unknown
}
