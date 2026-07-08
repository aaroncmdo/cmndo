// Baut eine Mapbox-Static-Images-URL fuer die Werkstatt-Standortkarte: ein Marker am
// Standort + (falls vorhanden) das 30-Min-Fahrgebiet (Isochrone) als gefuellte Flaeche.
// Rein + testbar. Kein client-seitiges mapbox-gl -> nur ein <img>. Nutzt den Public-Token.

interface GeoPolygon {
  type: string
  coordinates: unknown
}

export function baueWerkstattKartenUrl(opts: {
  lat: number
  lng: number
  isochrone: unknown
  token: string | undefined
  width?: number
  height?: number
}): string | null {
  const { lat, lng, token } = opts
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const features: unknown[] = []
  const iso = opts.isochrone as GeoPolygon | null
  if (iso && iso.type === 'Polygon' && Array.isArray(iso.coordinates)) {
    features.push({
      type: 'Feature',
      properties: { fill: '#4573a2', 'fill-opacity': 0.18, stroke: '#4573a2', 'stroke-width': 2 },
      geometry: iso,
    })
  }
  features.push({
    type: 'Feature',
    properties: { 'marker-color': '#0d1b3e', 'marker-size': 'medium' },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  })

  const overlay = `geojson(${encodeURIComponent(JSON.stringify({ type: 'FeatureCollection', features }))})`
  const w = opts.width ?? 640
  const h = opts.height ?? 320
  const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/auto/${w}x${h}@2x?padding=30&access_token=${token}`

  // Static-API-URL-Limit (~8192). Bei sehr dichter Isochrone auf Marker-only zuruueckfallen.
  if (url.length > 8000 && features.length > 1) {
    return baueWerkstattKartenUrl({ ...opts, isochrone: null })
  }
  return url
}
