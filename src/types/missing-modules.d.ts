// Typ-Stubs für optionale 3D-Pakete (drei, deck.gl, loaders.gl).
// Diese werden nur im Feldmodus-3D-Feature genutzt — lazy-geladen oder
// bei Bedarf. Die echten Packages werden installiert sobald das Feature
// produktionsreif ist (AAR-8xx Backlog).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyValue = any

declare module 'three' {
  export const WebGLRenderer: AnyValue
  export const Scene: AnyValue
  export const PerspectiveCamera: AnyValue
  export const AmbientLight: AnyValue
  export const DirectionalLight: AnyValue
  export const MeshStandardMaterial: AnyValue
  export const Mesh: AnyValue
  export const BoxGeometry: AnyValue
  export const SphereGeometry: AnyValue
  export const Group: AnyValue
  export const Vector3: AnyValue
  export const Quaternion: AnyValue
  export const Matrix4: AnyValue
  export const Color: AnyValue
  export const TextureLoader: AnyValue
  export const PMREMGenerator: AnyValue
  export const RGBAFormat: AnyValue
  export const HalfFloatType: AnyValue
  export const SRGBColorSpace: AnyValue
  export const Clock: AnyValue
  export const MathUtils: AnyValue
  export const MeshPhongMaterial: AnyValue
  export const MeshLambertMaterial: AnyValue
  export const Float32BufferAttribute: AnyValue
  export const BufferGeometry: AnyValue
  export const Points: AnyValue
  export const PointsMaterial: AnyValue
  export const CanvasTexture: AnyValue
  export type Texture = AnyValue
  export default AnyValue
}

declare module 'three/examples/jsm/loaders/OBJLoader.js' {
  export const OBJLoader: AnyValue
}

declare module 'three/examples/jsm/loaders/RGBELoader.js' {
  export const RGBELoader: AnyValue
}

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
