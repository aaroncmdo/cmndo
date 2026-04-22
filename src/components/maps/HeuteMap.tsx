'use client'

import { useEffect, useRef, useState } from 'react'

// KFZ-158 Phase 1: Google Maps Wrapper fuer die Tagesroute.
// Zeigt nummerierte Termin-Pins + eigene Live-Position + Directions-Route.

const MAPS_SCRIPT_ID = 'google-maps-script-heute'

function loadGoogleMapsWithDirections(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps && google.maps.DirectionsService) {
      resolve(); return
    }
    // Reuse existing script if loaded by another component
    const existing = document.querySelector('script[src*="maps.googleapis.com"]') as HTMLScriptElement | null
    if (existing) {
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.id = MAPS_SCRIPT_ID
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&v=weekly`
    s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google Maps load failed'))
    document.head.appendChild(s)
  })
}

export type MapTermin = {
  id: string
  lat: number
  lng: number
  label: string
  adresse: string
}

export default function HeuteMap({
  termine,
  myPosition,
  svLat,
  svLng,
  activeTerminId,
  onTerminClick,
}: {
  termine: MapTermin[]
  myPosition?: { lat: number; lng: number } | null
  svLat: number | null
  svLng: number | null
  activeTerminId?: string | null
  onTerminClick?: (id: string) => void
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const myMarkerRef = useRef<google.maps.Marker | null>(null)
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null)
  const [ready, setReady] = useState(false)

  // Init map
  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return
    let cancelled = false
    loadGoogleMapsWithDirections(apiKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const defaultCenter = svLat && svLng ? { lat: svLat, lng: svLng } : { lat: 50.9375, lng: 6.9603 }
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: defaultCenter,
        zoom: 11,
        gestureHandling: 'greedy',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8ef' }] },
          { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
        ],
      })
      setReady(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // Update termin markers
  useEffect(() => {
    if (!ready || !mapRef.current) return
    // Clear old markers
    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []

    const bounds = new google.maps.LatLngBounds()

    termine.forEach((t, i) => {
      const marker = new google.maps.Marker({
        position: { lat: t.lat, lng: t.lng },
        map: mapRef.current!,
        label: {
          text: String(i + 1),
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '12px',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: activeTerminId === t.id ? '#4573A2' : '#1E3A5F',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: t.label,
        zIndex: activeTerminId === t.id ? 10 : 1,
      })
      marker.addListener('click', () => onTerminClick?.(t.id))
      markersRef.current.push(marker)
      bounds.extend({ lat: t.lat, lng: t.lng })
    })

    if (myPosition) bounds.extend(myPosition)
    else if (svLat && svLng) bounds.extend({ lat: svLat, lng: svLng })

    if (termine.length > 0) {
      mapRef.current.fitBounds(bounds, 60)
    }
  }, [ready, termine, activeTerminId, myPosition, svLat, svLng, onTerminClick])

  // My position marker (blue pulse)
  useEffect(() => {
    if (!ready || !mapRef.current) return
    if (myMarkerRef.current) myMarkerRef.current.setMap(null)
    if (!myPosition) return

    myMarkerRef.current = new google.maps.Marker({
      position: myPosition,
      map: mapRef.current,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#3B82F6',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
      },
      title: 'Mein Standort',
      zIndex: 20,
    })
  }, [ready, myPosition])

  // Directions route
  useEffect(() => {
    if (!ready || !mapRef.current || termine.length < 2) {
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null)
        directionsRendererRef.current = null
      }
      return
    }

    const origin = myPosition ?? (svLat && svLng ? { lat: svLat, lng: svLng } : null)
    if (!origin) return

    const waypoints = termine.slice(0, -1).map(t => ({
      location: new google.maps.LatLng(t.lat, t.lng),
      stopover: true,
    }))
    const destination = termine[termine.length - 1]

    const directionsService = new google.maps.DirectionsService()
    directionsService.route(
      {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          if (directionsRendererRef.current) directionsRendererRef.current.setMap(null)
          const renderer = new google.maps.DirectionsRenderer({
            map: mapRef.current!,
            directions: result,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: '#4573A2',
              strokeWeight: 4,
              strokeOpacity: 0.7,
            },
          })
          directionsRendererRef.current = renderer
        }
      },
    )
  }, [ready, termine, myPosition, svLat, svLng])

  return (
    <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden bg-gray-100" />
  )
}
