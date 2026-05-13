// Stub-Modul für three.js — wird genutzt bis das Paket installiert ist.
// Feldmodus-3D-Features (hero-pin, sv-car-3d, weather-fx) sind WIP.
/* eslint-disable @typescript-eslint/no-explicit-any */
// CMM-14 (14.05.26): Target muss eine Function sein damit `new stub()`
// nicht „is not a constructor" wirft — Proxy.construct-Trap feuert nur
// auf callable Targets, plain `{}` ist nicht callable. Mit function-Target
// können sowohl `new stub()` (construct) als auch `stub(...)` (apply) und
// `stub.Color` (get) abgefangen werden.
const stub: any = new Proxy(
  function () {} as unknown as object,
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
export const BufferAttribute = stub
export const Points = stub
export const PointsMaterial = stub
export const CanvasTexture = stub
export const AdditiveBlending = stub
export const DoubleSide = stub
export const CylinderGeometry = stub
export const PlaneGeometry = stub
export const RingGeometry = stub
export const LineBasicMaterial = stub
export const LineSegments = stub
export const MeshBasicMaterial = stub
export const SpriteMaterial = stub
export const Sprite = stub
export const Texture = stub
export const DataTexture = stub
export const EquirectangularReflectionMapping = stub
export const Object3D = stub
export const Camera = stub
export const Material = stub
export const MapboxOverlay = stub
export const Tile3DLayer = stub
export const Tiles3DLoader = stub
export const CesiumIonLoader = stub
export const OBJLoader = stub
export const RGBELoader = stub
// 2026-05-11 VPS-Deploy: three/examples/jsm/loaders/*.js importieren Named-
// Exports direkt aus 'three'. Turbopack macht statische Export-Analyse und
// failt wenn ein Export fehlt — auch wenn der Proxy zur Runtime alles
// abfaengt. Alle in three/examples/jsm/* referenzierten Top-Level-Exports
// proaktiv hier ergaenzen, sonst Build-Break pro Iteration.
export const Loader = stub
export const DataTextureLoader = stub
export const DataUtils = stub
export const FileLoader = stub
export const FloatType = stub
export const LinearFilter = stub
export const LinearSRGBColorSpace = stub
// Verwandte Filter/Format/Type-Konstanten die three/examples/jsm/loaders
// haeufig importiert, proaktiv hier um Build-Loop zu vermeiden.
export const NearestFilter = stub
export const RepeatWrapping = stub
export const ClampToEdgeWrapping = stub
export const RGBFormat = stub
export const UnsignedByteType = stub
export const UVMapping = stub
export const ImageLoader = stub
export const CompressedTextureLoader = stub
export const CubeTextureLoader = stub
export const AudioLoader = stub
export const AnimationClip = stub
export const Bone = stub
export const SkinnedMesh = stub
export const Skeleton = stub
export const VectorKeyframeTrack = stub
export const QuaternionKeyframeTrack = stub
export const NumberKeyframeTrack = stub
export const InterpolateLinear = stub
export const InterpolateSmooth = stub
export const InterpolateDiscrete = stub
