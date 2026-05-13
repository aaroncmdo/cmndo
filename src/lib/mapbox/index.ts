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
  tryAddSvCarThreeJs,
  getSvCarObjUrl,
  SV_CAR_THREE_LAYER_ID,
  type SvCarThreeHandle,
  type SvCarThreePose,
} from './sv-car-3d-three'
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
export { upsertRouteLayer, upsertTrafficRouteLayer, removeRouteLayer } from './route-layer'
export {
  fetchDrivingRoute,
  routeToCongestionFeatures,
  type CongestionLevel,
  type RouteSegment,
  type TrafficRoute,
  type DirectionsResult,
} from './directions'
export {
  pickFasterAlternative,
  findHazardOnRoute,
  distanceToHazardM,
  REROUTE_FASTER_THRESHOLD_SEC,
  REROUTE_POLL_INTERVAL_MS,
  REROUTE_MIN_DISTANCE_TO_STOP_M,
  REROUTE_AUTO_ACCEPT_MS,
  HAZARD_ON_ROUTE_RADIUS_M,
  type ProposedReroute,
  type RerouteReason,
} from './live-reroute'
export {
  fetchBlitzerInBbox,
  bboxForRoute,
  attachBlitzerLayer,
  BLITZER_LAYER_ID,
  type BlitzerFeature,
  type BlitzerLayerHandle,
} from './blitzer'
export {
  fetchHereHazards,
  attachHazardLayer,
  HAZARD_LAYER_ID,
  type HazardFeature,
  type HazardLayerHandle,
  fetchHereFlow,
  attachFlowLayer,
  FLOW_LAYER_ID,
  type FlowFeature,
  type FlowLayerHandle,
} from './hazards'
export {
  DEFAULT_FIELD_MAP_CONFIG,
  type FieldModusMapConfig,
  type MarkerSkin,
} from './types'
export { getMapboxLightPreset, type MapboxLightPreset } from './light-preset'
