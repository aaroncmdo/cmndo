// AAR-380: Zentraler Re-Export für Mapbox-Helfer.

export { ensureMapboxInitialized, mapboxgl } from './client'
export {
  MAPBOX_STYLE_STANDARD,
  MAPBOX_STYLE_STANDARD_SATELLITE,
  MAPBOX_STYLE_STREETS,
  MAPBOX_STYLE_NAVIGATION_DAY,
  MAPBOX_STYLE_NAVIGATION_NIGHT,
} from './styles'
export { addSvAvatarMarker, addSvCarMarker, type SvMarkerOptions, type SvCarMarkerOptions } from './sv-marker'
export {
  tryAddSvCar3dModel,
  SV_CAR_3D_DEFAULT_GLB,
  SV_CAR_3D_LAYER_ID,
  SV_CAR_3D_SOURCE_ID,
  type SvCar3dHandle,
  type SvCar3dPose,
} from './sv-3d-car'
export {
  attachHeroPin3d,
  HERO_PIN_LAYER_ID,
  type HeroPin3dHandle,
} from './hero-pin-3d'
export {
  attachGoogle3dTiles,
  isGoogle3dTilesEnabled,
  type Google3dTilesHandle,
} from './google-3d-tiles'
export {
  attachCesium3dTiles,
  isCesium3dTilesEnabled,
  type Cesium3dTilesHandle,
} from './cesium-3d-tiles'
export { addKundeMarker, type KundeMarkerOptions } from './kunde-marker'
export { upsertRouteLayer, removeRouteLayer } from './route-layer'
export { fetchDrivingRoute } from './directions'
export {
  DEFAULT_FIELD_MAP_CONFIG,
  type FieldModusMapConfig,
  type MarkerSkin,
} from './types'
export { getMapboxLightPreset, type MapboxLightPreset } from './light-preset'
