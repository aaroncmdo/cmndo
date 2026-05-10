// Stub-Modul für three.js — wird genutzt bis das Paket installiert ist.
// Feldmodus-3D-Features (hero-pin, sv-car-3d, weather-fx) sind WIP.
/* eslint-disable @typescript-eslint/no-explicit-any */
const stub: any = new Proxy(
  {},
  {
    get: () => stub,
    construct: () => ({}),
    apply: () => undefined,
  },
)
export default stub
export const WebGLRenderer = stub
export const Scene = stub
export const PerspectiveCamera = stub
export const AmbientLight = stub
export const DirectionalLight = stub
export const MeshStandardMaterial = stub
export const Mesh = stub
export const BoxGeometry = stub
export const SphereGeometry = stub
export const Group = stub
export const Vector3 = stub
export const Quaternion = stub
export const Matrix4 = stub
export const Color = stub
export const TextureLoader = stub
export const PMREMGenerator = stub
export const RGBAFormat = stub
export const HalfFloatType = stub
export const SRGBColorSpace = stub
export const Clock = stub
export const MathUtils = stub
export const MeshPhongMaterial = stub
export const MeshLambertMaterial = stub
export const Float32BufferAttribute = stub
export const BufferGeometry = stub
export const Points = stub
export const PointsMaterial = stub
export const CanvasTexture = stub
export const MapboxOverlay = stub
export const Tile3DLayer = stub
export const Tiles3DLoader = stub
export const CesiumIonLoader = stub
export const OBJLoader = stub
export const RGBELoader = stub
