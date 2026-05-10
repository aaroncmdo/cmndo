'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2Icon, PenLineIcon } from 'lucide-react'

// KFZ-152 Phase 3 Follow-up: Polygon-Editor fuer Community-Exklusivgebiete.
// Loadet die Google Maps Drawing Library und stellt einen DrawingManager bereit
// mit dem der Admin ein Polygon zeichnen kann. Das Polygon wird als Array von
// {lat,lng}-Punkten ueber `onChange` zurueckgegeben.
//
// Backwards-compatible: wenn `initialPolygon` nicht gesetzt ist, startet der
// Editor leer. Der Wizard kann zwischen Circle (MVP) und Polygon umschalten —
// dieser Editor liefert die Polygon-Variante.

const MAPS_SCRIPT_ID = 'google-maps-script-drawing'

function loadGoogleMapsWithDrawing(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps && google.maps.drawing) {
      resolve()
      return
    }
    // Wenn das normale Maps-Script schon geladen ist (ohne drawing), trotzdem
    // ein zweites Script mit drawing nachladen — Google ignoriert dann die
    // Reload-Warnings, aber der Editor funktioniert. In der Praxis wird der
    // Editor nur im Communities-Wizard genutzt, wo bisher kein Maps-Script lief.
    if (document.getElementById(MAPS_SCRIPT_ID)) {
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps && google.maps.drawing) {
          clearInterval(check)
          resolve()
        }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.id = MAPS_SCRIPT_ID
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=drawing,places&loading=async&v=weekly`
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google Maps (drawing) load failed'))
    document.head.appendChild(s)
  })
}

export type PolygonPath = { lat: number; lng: number }[]

export default function PolygonEditor({
  centerLat,
  centerLng,
  initialPolygon,
  onChange,
}: {
  centerLat: number | null
  centerLng: number | null
  initialPolygon?: PolygonPath | null
  onChange: (path: PolygonPath | null) => void
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const polygonRef = useRef<google.maps.Polygon | null>(null)
  const drawingMgrRef = useRef<google.maps.drawing.DrawingManager | null>(null)
  const [ready, setReady] = useState(false)
  const [hasPolygon, setHasPolygon] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Map init (runs once when API-Key + Container vorhanden) ────────────
  useEffect(() => {
    if (!apiKey) {
      setError('NEXT_PUBLIC_GOOGLE_MAPS_KEY fehlt')
      return
    }
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    loadGoogleMapsWithDrawing(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const center = centerLat != null && centerLng != null
          ? { lat: centerLat, lng: centerLng }
          : { lat: 51.1657, lng: 10.4515 }
        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom: centerLat != null ? 9 : 6,
          gestureHandling: 'greedy',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        mapRef.current = map

        const drawingManager = new google.maps.drawing.DrawingManager({
          drawingMode: null,
          drawingControl: true,
          drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [google.maps.drawing.OverlayType.POLYGON],
          },
          polygonOptions: {
            fillColor: '#4573A2',
            fillOpacity: 0.18,
            strokeColor: '#1E3A5F',
            strokeWeight: 2,
            editable: true,
            draggable: true,
            zIndex: 5,
          },
        })
        drawingManager.setMap(map)
        drawingMgrRef.current = drawingManager

        google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon: google.maps.Polygon) => {
          // Existing Polygon ersetzen — wir erlauben nur EIN Polygon
          if (polygonRef.current) {
            polygonRef.current.setMap(null)
          }
          polygonRef.current = polygon
          setHasPolygon(true)
          drawingManager.setDrawingMode(null)
          attachPolygonListeners(polygon)
          emitPolygon(polygon)
        })

        // Initial Polygon falls vorhanden
        if (initialPolygon && initialPolygon.length >= 3) {
          const poly = new google.maps.Polygon({
            paths: initialPolygon,
            fillColor: '#4573A2',
            fillOpacity: 0.18,
            strokeColor: '#1E3A5F',
            strokeWeight: 2,
            editable: true,
            draggable: true,
            map,
          })
          polygonRef.current = poly
          setHasPolygon(true)
          attachPolygonListeners(poly)
          // Map auf Polygon-Bounds zoomen
          const bounds = new google.maps.LatLngBounds()
          for (const p of initialPolygon) bounds.extend(p)
          map.fitBounds(bounds)
        }

        setReady(true)
      })
      .catch(err => setError(err.message ?? String(err)))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // ─── Center-Update wenn sich centerLat/Lng aendert UND noch kein Polygon
  useEffect(() => {
    if (!ready || !mapRef.current) return
    if (polygonRef.current) return // existing polygon hat Vorrang
    if (centerLat != null && centerLng != null) {
      mapRef.current.setCenter({ lat: centerLat, lng: centerLng })
      mapRef.current.setZoom(9)
    }
  }, [centerLat, centerLng, ready])

  function attachPolygonListeners(polygon: google.maps.Polygon) {
    const path = polygon.getPath()
    const handler = () => emitPolygon(polygon)
    path.addListener('set_at', handler)
    path.addListener('insert_at', handler)
    path.addListener('remove_at', handler)
    polygon.addListener('dragend', handler)
  }

  function emitPolygon(polygon: google.maps.Polygon) {
    const path = polygon.getPath()
    const points: PolygonPath = []
    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i)
      points.push({ lat: p.lat(), lng: p.lng() })
    }
    onChange(points.length >= 3 ? points : null)
  }

  function handleClear() {
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
      polygonRef.current = null
    }
    setHasPolygon(false)
    onChange(null)
    if (drawingMgrRef.current) {
      drawingMgrRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON)
    }
  }

  function handleDraw() {
    if (drawingMgrRef.current) {
      drawingMgrRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON)
    }
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
        Polygon-Editor konnte nicht geladen werden: {error}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="w-full h-72 rounded-xl border border-claimondo-border overflow-hidden bg-claimondo-bg" />
      <div className="flex items-center justify-between text-[10px] text-claimondo-ondo">
        <span>
          {hasPolygon
            ? '✓ Polygon gesetzt — Ecken zum Anpassen ziehen, Mitte zum Verschieben.'
            : 'Mit dem Polygon-Tool oben in der Karte das Gebiet einzeichnen.'}
        </span>
        <div className="flex gap-1">
          {!hasPolygon && (
            <button type="button" onClick={handleDraw}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-claimondo-ondo/10 hover:bg-claimondo-ondo/20 text-claimondo-ondo">
              <PenLineIcon className="w-3 h-3" /> Zeichnen
            </button>
          )}
          {hasPolygon && (
            <button type="button" onClick={handleClear}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600">
              <Trash2Icon className="w-3 h-3" /> Loeschen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
