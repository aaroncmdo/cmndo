// AAR-380: Zentraler Re-Export für Mapbox-Helfer.

export { ensureMapboxInitialized, mapboxgl } from './client'
export {
  MAPBOX_STYLE_STANDARD,
  MAPBOX_STYLE_STREETS,
  MAPBOX_STYLE_NAVIGATION_DAY,
  MAPBOX_STYLE_NAVIGATION_NIGHT,
} from './styles'
export { addSvAvatarMarker, addSvCarMarker, type SvMarkerOptions, type SvCarMarkerOptions } from './sv-marker'
export { addKundeMarker, type KundeMarkerOptions } from './kunde-marker'
export {
  upsertRouteLayer,
  removeRouteLayer,
  type RouteLayerIds,
} from './route-layer'
export {
  DEFAULT_FIELD_MAP_CONFIG,
  type FieldModusMapConfig,
  type MarkerSkin,
} from './types'
export { getMapboxLightPreset, type MapboxLightPreset } from './light-preset'
