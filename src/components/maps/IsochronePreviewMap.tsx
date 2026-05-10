'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPinIcon } from 'lucide-react'
import { previewIsochrone, type IsochronePreviewResult } from '@/app/admin/sachverstaendige/anlegen/actions'

// AAR-364 SUB-1: Live-Karte mit Isochrone-Preview fuer den Admin-Wizard.
// Laedt Google Maps via <script>-Tag (gleiche Methode wie LiveTrackingMap),
// setzt einen Marker am SV-Standort und zeichnet das Fahr-Isochronen-Polygon
// (oder Kreis-Fallback falls HERE API nicht antwortet). Bei Paket-/Radius-
// Wechsel wird die Vorschau neu berechnet (debounced).

function loadMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps) { resolve(); return }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existing) {
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&v=weekly`
    s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Maps load failed'))
    document.head.appendChild(s)
  })
}

type Props = {
  lat: number | null
  lng: number | null
  radius_km: number
  adresse?: string | null
  paketLabel?: string
}

export default function IsochronePreviewMap({ lat, lng, radius_km, adresse, paketLabel }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)
  const polygonRef = useRef<google.maps.Polygon | null>(null)
  const circleRef = useRef<google.maps.Circle | null>(null)
  const [preview, setPreview] = useState<IsochronePreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  // Map-Init sobald wir einen Standort haben
  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return
    if (lat == null || lng == null) return
    let cancelled = false
    loadMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: { lat, lng },
        zoom: 11,
        gestureHandling: 'cooperative',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      })
      markerRef.current = new google.maps.Marker({
        position: { lat, lng },
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#0D1B3E',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        title: adresse ?? 'SV-Standort',
      })
      setMapReady(true)
    }).catch(() => { /* silent — Fallback-Hinweis unten */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, lat !== null && lng !== null])

  // Marker-Position bei Adress-Wechsel aktualisieren
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    if (lat == null || lng == null) return
    markerRef.current.setPosition({ lat, lng })
    mapRef.current.setCenter({ lat, lng })
  }, [lat, lng])

  // Debounced Isochrone-Fetch bei Standort-/Radius-Wechsel
  useEffect(() => {
    if (lat == null || lng == null || !radius_km || radius_km <= 0) {
      setPreview(null)
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      const r = await previewIsochrone({ lat, lng, radius_km })
      setPreview(r)
      setLoading(false)
    }, 400)
    return () => clearTimeout(handle)
  }, [lat, lng, radius_km])

  // Polygon/Circle auf der Karte nachziehen
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    // Alte Overlays entfernen
    polygonRef.current?.setMap(null)
    polygonRef.current = null
    circleRef.current?.setMap(null)
    circleRef.current = null

    if (!preview || !preview.success) return

    if (preview.mode === 'isochrone') {
      polygonRef.current = new google.maps.Polygon({
        paths: preview.polygon.map(p => ({ lat: p.lat, lng: p.lng })),
        strokeColor: '#4573A2',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: '#4573A2',
        fillOpacity: 0.15,
        map: mapRef.current,
      })
      // Fit-Bounds auf Polygon
      const bounds = new google.maps.LatLngBounds()
      for (const p of preview.polygon) bounds.extend({ lat: p.lat, lng: p.lng })
      mapRef.current.fitBounds(bounds, 40)
    } else if (preview.mode === 'fallback-circle') {
      circleRef.current = new google.maps.Circle({
        center: preview.center,
        radius: preview.radius_km * 1000,
        strokeColor: '#7BA3CC',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: '#7BA3CC',
        fillOpacity: 0.12,
        map: mapRef.current,
      })
      mapRef.current.fitBounds(circleRef.current.getBounds()!, 40)
    }
  }, [preview, mapReady])

  if (!apiKey) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
        <strong>Karten-Vorschau nicht verfügbar:</strong> <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> fehlt.
      </div>
    )
  }

  if (lat == null || lng == null) {
    return (
      <div className="bg-[#f8f9fb] border border-claimondo-border rounded-xl p-6 flex items-center justify-center text-xs text-claimondo-ondo">
        <MapPinIcon className="w-4 h-4 mr-2" />
        Adresse wählen, um Einsatzgebiet-Vorschau zu laden.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-claimondo-ondo">
        <span>
          <strong className="text-claimondo-navy">Einsatzgebiet-Vorschau</strong>
          {paketLabel && <span className="ml-2 text-[#4573A2]">· {paketLabel}</span>}
          <span className="ml-2">· {radius_km} km</span>
        </span>
        <span>
          {loading
            ? 'Berechne…'
            : preview?.success && preview.mode === 'isochrone'
              ? 'Fahr-Isochrone (HERE)'
              : preview?.success && preview.mode === 'fallback-circle'
                ? 'Radius-Fallback'
                : '—'}
        </span>
      </div>
      <div ref={containerRef} className="w-full h-[280px] rounded-xl border border-claimondo-border overflow-hidden bg-[#f8f9fb]" />
      {preview?.success && preview.mode === 'fallback-circle' && (
        <p className="text-[10px] text-amber-600">
          Isochrone-API nicht verfügbar — Kreis-Approximation als Vorschau ({preview.reason}).
        </p>
      )}
    </div>
  )
}
