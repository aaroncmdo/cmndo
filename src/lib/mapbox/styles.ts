// AAR-380: Mapbox Style-URL-Konstanten.

/** Standard-Style mit 3D-Buildings out of the box. Für Fokus-Modus. */
export const MAPBOX_STYLE_STANDARD = 'mapbox://styles/mapbox/standard'

/** 2026-05-07: Standard + photogrammetrische Satelliten-Imagery (echte
 *  Foto-Texturen auf 3D-Gebäuden). Hyperrealistisch — fuer die Heute-Page,
 *  wo der SV beim Frühstück seine Tagesroute begutachtet. Feldmodus bleibt
 *  auf Standard (rohere Performance + weniger Mobile-Daten beim Fahren). */
export const MAPBOX_STYLE_STANDARD_SATELLITE =
  'mapbox://styles/mapbox/standard-satellite'

/** Streets V12 — 2D-Fallback (z. B. Kunden-Ansicht). */
export const MAPBOX_STYLE_STREETS = 'mapbox://styles/mapbox/streets-v12'

/** Navigation-Tag — für Turn-by-Turn-artige Ansichten. */
export const MAPBOX_STYLE_NAVIGATION_DAY =
  'mapbox://styles/mapbox/navigation-day-v1'

export const MAPBOX_STYLE_NAVIGATION_NIGHT =
  'mapbox://styles/mapbox/navigation-night-v1'
