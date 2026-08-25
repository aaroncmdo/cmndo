// Token-Audit-Skip: Mapbox-GL-Marker werden via innerHTML aus Template-Literals
//   mit raw hex gebaut (background:#0D1B3E) — analog GutachterFinderMapClient.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useCallback, useState } from 'react'
import { MapPinIcon, ShieldCheckIcon, ClockIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SvClaimClient } from './SvClaimClient'
import { ladeClaimbarePinLeads } from '@/lib/sv-basic/claim-actions'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const COL_NAVY = '#0D1B3E'

type Coord = { lat: number; lng: number }
type SvLeadPin = { id: string; lat: number; lng: number }

// Geocodiert eine PLZ → Koordinaten via Mapbox
async function geocodePlz(plz: string): Promise<Coord | null> {
  if (!MAPBOX_TOKEN || !/^\d{5}$/.test(plz)) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(plz + ' Deutschland')}.json?country=de&types=postcode,place&access_token=${MAPBOX_TOKEN}&limit=1`,
    )
    const json = await res.json() as { features?: Array<{ center: [number, number] }> }
    const f = json.features?.[0]
    if (!f) return null
    return { lat: f.center[1], lng: f.center[0] }
  } catch { return null }
}

// Reverse-Geocode: Koordinaten → 5-stellige PLZ (Pin-Klick → Suchfeld-Prefill).
async function reverseGeocodePlz(lat: number, lng: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=de&types=postcode&access_token=${MAPBOX_TOKEN}&limit=1`,
    )
    const json = await res.json() as { features?: Array<{ text?: string }> }
    const plz = json.features?.[0]?.text
    return plz && /^\d{5}$/.test(plz) ? plz : null
  } catch { return null }
}

// Berechnet Isochrone oder fällt auf Kreis zurück
async function fetchIsochrone(coord: Coord, radiusKm: number): Promise<[number, number][] | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/isochrone/v1/mapbox/driving/${coord.lng},${coord.lat}?contours_minutes=${Math.round(radiusKm * 1.5)}&polygons=true&access_token=${MAPBOX_TOKEN}`,
    )
    const json = await res.json() as { features?: Array<{ geometry: { coordinates: [number, number][][] } }> }
    return json.features?.[0]?.geometry?.coordinates?.[0] ?? null
  } catch { return null }
}

function flächeKm2(radiusKm: number): number {
  return Math.round(Math.PI * radiusKm * radiusKm)
}

export default function GutachterPartnerClient() {
  const t = useTranslations('gutachter_partner')
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const pinMarkersRef = useRef<mapboxgl.Marker[]>([])

  const [radiusKm] = useState(30)
  const [coord, setCoord] = useState<Coord | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [pins, setPins] = useState<SvLeadPin[]>([])
  const [aktivePlz, setAktivePlz] = useState('')

  // Mapbox initialisieren
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN
      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [10.4515, 51.1657],
        zoom: 5.5,
        attributionControl: false,
      })
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))
      map.on('load', () => {
        map.addSource('radius-fill', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius-fill', paint: { 'fill-color': COL_NAVY, 'fill-opacity': 0.12 } })
        map.addLayer({ id: 'radius-stroke', type: 'line', source: 'radius-fill', paint: { 'line-color': '#4573A2', 'line-width': 2, 'line-dasharray': [4, 2] } })
        mapRef.current = map
        setMapReady(true)
      })
      return () => { map.remove() }
    })
  }, [])

  // Offene DAT-Cold-Pins laden (anon-safe: nur id/lat/lng).
  useEffect(() => {
    let cancelled = false
    ladeClaimbarePinLeads().then((res) => {
      if (!cancelled && res.ok) setPins(res.data)
    })
    return () => { cancelled = true }
  }, [])

  // Radius + Marker an einem Punkt zeichnen (shared: PLZ-Suche + Pin-Klick).
  const drawRadius = useCallback(async (c: Coord) => {
    const map = mapRef.current
    if (!map) return
    setCoord(c)
    const mapboxgl = (await import('mapbox-gl')).default
    if (markerRef.current) markerRef.current.remove()
    markerRef.current = new mapboxgl.Marker({ color: COL_NAVY }).setLngLat([c.lng, c.lat]).addTo(map)
    map.flyTo({ center: [c.lng, c.lat], zoom: 9, duration: 1200 })

    const iso = await fetchIsochrone(c, radiusKm)
    const src = map.getSource('radius-fill') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    if (iso) {
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [iso] }, properties: {} }] })
    } else {
      const pts: [number, number][] = []
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI
        const dlat = (radiusKm / 111) * Math.cos(angle)
        const dlng = (radiusKm / (111 * Math.cos(c.lat * Math.PI / 180))) * Math.sin(angle)
        pts.push([c.lng + dlng, c.lat + dlat])
      }
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} }] })
    }
  }, [radiusKm])

  // PLZ-Eingabe (aus dem Claim-Suchfeld) → Karte nachziehen.
  const updateMap = useCallback(async (plz: string) => {
    if (!mapReady) return
    const c = await geocodePlz(plz)
    if (c) await drawRadius(c)
  }, [mapReady, drawRadius])

  // Claim → Karte: SvClaimClient meldet getippte PLZ hoch.
  const handleClaimPlz = useCallback((plz: string) => {
    setAktivePlz(plz)
    void updateMap(plz)
  }, [updateMap])

  // Pin-Klick → Karte zentrieren + Radius + PLZ ins Suchfeld (kein Auto-Submit).
  const handlePinClick = useCallback(async (lat: number, lng: number) => {
    await drawRadius({ lat, lng })
    const plz = await reverseGeocodePlz(lat, lng)
    if (plz) setAktivePlz(plz)
  }, [drawRadius])

  // Pin-Klick-Handler via Ref, damit der Marker-Render-Effekt nicht an der
  // Callback-Identitaet haengt (Marker werden genau einmal gesetzt).
  const onPinClickRef = useRef<(lat: number, lng: number) => void>(() => {})
  onPinClickRef.current = (lat, lng) => { void handlePinClick(lat, lng) }

  // Klickbare Cold-Pins rendern, sobald Karte + Pins bereit sind.
  useEffect(() => {
    if (!mapReady || !mapRef.current || pins.length === 0) return
    let cancelled = false
    const store = pinMarkersRef.current
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !mapRef.current) return
      for (const p of pins) {
        const el = document.createElement('div')
        el.style.cursor = 'pointer'
        el.setAttribute('role', 'button')
        el.setAttribute('aria-label', 'Diesen Standort beanspruchen')
        el.innerHTML = `<div style="width:18px;height:18px;display:grid;place-items:center;border-radius:50%;background:${COL_NAVY};box-shadow:0 2px 6px rgba(13,27,62,0.30);border:2px solid #fff"><span style="font-family:Montserrat,system-ui,sans-serif;font-size:9px;font-weight:900;color:#fff;line-height:1;letter-spacing:-.02em">C</span></div>`
        el.addEventListener('click', () => onPinClickRef.current(p.lat, p.lng))
        const m = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(mapRef.current!)
        store.push(m)
      }
    })
    return () => {
      cancelled = true
      store.forEach((m) => m.remove())
      pinMarkersRef.current = []
    }
  }, [mapReady, pins])

  return (
    <div className="min-h-screen bg-claimondo-bg">
      {/* Hero */}
      <div className="bg-claimondo-navy text-white px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-6">
          <ShieldCheckIcon className="w-4 h-4 text-claimondo-light-blue" />
          {t('hero.badge')}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4 max-w-2xl mx-auto">
          {t('hero.headline')}
        </h1>
        <p className="text-claimondo-light-blue max-w-xl mx-auto text-base leading-relaxed">
          {t('hero.subheadline')}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          {([
            { icon: ClockIcon, key: 'hero.feature_auftraege' as const },
            { icon: ShieldCheckIcon, key: 'hero.feature_verifiziert' as const },
            { icon: MapPinIcon, key: 'hero.feature_radius' as const },
          ] as const).map(({ icon: Icon, key }) => (
            <div key={key} className="flex items-center gap-2 text-white/70">
              <Icon className="w-4 h-4 text-claimondo-light-blue" />
              {t(key)}
            </div>
          ))}
        </div>
      </div>

      {/* SV-Claim-Flow + Karte */}
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Linke Seite – SV-Claim-Flow (Karte<->Claim bidirektional verdrahtet) */}
        <SvClaimClient initialQuery={aktivePlz} onPlzChange={handleClaimPlz} />

        {/* Rechte Seite – Karte */}
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="bg-white rounded-3xl shadow-claimondo-md overflow-hidden">
            <div className="px-5 py-4 border-b border-claimondo-navy/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-claimondo-navy tracking-[-.018em]">{t('map.heading')}</h3>
                {coord ? (
                  <p className="text-xs text-claimondo-ondo mt-0.5">{t('map.radius_hint', { radius: radiusKm, ort: '' })}</p>
                ) : (
                  <p className="text-xs text-claimondo-ondo/60 mt-0.5">{t('map.plz_prompt')}</p>
                )}
              </div>
              {coord && (
                <div className="text-right">
                  <span className="text-lg font-bold text-claimondo-navy">~{flächeKm2(radiusKm).toLocaleString('de-DE')}</span>
                  <span className="text-xs text-claimondo-ondo ml-1">{t('map.flaeche_einheit')}</span>
                </div>
              )}
            </div>
            <div ref={mapContainer} style={{ height: 360 }} className="w-full" />
            {!MAPBOX_TOKEN && (
              <div className="absolute inset-0 flex items-center justify-center bg-claimondo-bg text-sm text-claimondo-ondo/60">
                {t('map.no_token')}
              </div>
            )}
          </div>

          <div className="bg-claimondo-navy/[0.04] border border-claimondo-navy/[0.08] rounded-2xl px-5 py-4 text-xs text-claimondo-ondo leading-relaxed">
            <strong className="text-claimondo-navy block mb-1">{t('map.standardgebiet', { radius: radiusKm, flaeche: flächeKm2(radiusKm).toLocaleString('de-DE') })}</strong>
            {t('map.standardgebiet_mehr')}
          </div>
        </div>
      </div>
    </div>
  )
}
