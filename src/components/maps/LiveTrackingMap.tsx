'use client'

import { useEffect, useRef, useState } from 'react'

// KFZ-179: Kunden-Tracking-Map — zeigt SV-Position + Termin-Standort.

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

export default function LiveTrackingMap({
  svPosition,
  terminLat,
  terminLng,
}: {
  svPosition: { lat: number; lng: number } | null
  terminLat: number
  terminLng: number
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const svMarkerRef = useRef<google.maps.Marker | null>(null)
  const terminMarkerRef = useRef<google.maps.Marker | null>(null)
  const [ready, setReady] = useState(false)

  // Init
  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return
    let cancelled = false
    loadMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: { lat: terminLat, lng: terminLng },
        zoom: 13,
        gestureHandling: 'greedy',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      })

      // Termin-Marker
      terminMarkerRef.current = new google.maps.Marker({
        position: { lat: terminLat, lng: terminLng },
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#1E3A5F',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        title: 'Termin-Standort',
      })
      setReady(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // SV-Position updaten
  useEffect(() => {
    if (!ready || !mapRef.current) return
    if (!svPosition) return

    if (svMarkerRef.current) {
      svMarkerRef.current.setPosition(svPosition)
    } else {
      svMarkerRef.current = new google.maps.Marker({
        position: svPosition,
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        title: 'Sachverständiger',
        zIndex: 20,
      })
    }

    // Fit bounds
    const bounds = new google.maps.LatLngBounds()
    bounds.extend(svPosition)
    bounds.extend({ lat: terminLat, lng: terminLng })
    mapRef.current.fitBounds(bounds, 60)
  }, [ready, svPosition, terminLat, terminLng])

  return <div ref={containerRef} className="w-full h-full bg-[#f8f9fb]" />
}
