// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings fuer marker fills + paint properties.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap } from 'mapbox-gl'
import ErrorState from '@/components/shared/ErrorState'
import type { LiveOpsData } from './types'
import type { LiveOpsRole } from '@/lib/live-ops'

// ------------------------------------------------------------------ Props

export interface LiveOpsMapProps {
  role: LiveOpsRole
  data: LiveOpsData
}

// ------------------------------------------------------------------ Component

export default function LiveOpsMap({ role, data }: LiveOpsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // retryKey wird bei Retry inkrementiert → loest useEffect-Re-Mount aus
  const [retryKey, setRetryKey] = useState(0)

  // Verhindert, dass der Fehlerfall bei HMR-Reload falsch ausloest.
  const mountedRef = useRef(false)

  const handleRetry = useCallback(() => {
    setError(null)
    setReady(false)
    setRetryKey((k) => k + 1)
  }, [])

  // Map mount / teardown
  useEffect(() => {
    if (!containerRef.current) return
    mountedRef.current = true

    const ok = ensureMapboxInitialized()
    if (!ok) {
      setError('kein Token')
      return
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [10.45, 51.16],
      zoom: 5.4,
      attributionControl: false,
    })

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false }),
      'top-right',
    )

    map.on('load', () => {
      if (mountedRef.current) setReady(true)
    })

    map.on('error', (e) => {
      console.error('[LiveOpsMap] Mapbox-Fehler', e)
      if (mountedRef.current) {
        setError('Kartenfehler: ' + (e.error?.message ?? 'unbekannt'))
      }
    })

    mapRef.current = map

    return () => {
      mountedRef.current = false
      map.remove()
      mapRef.current = null
    }
  // retryKey steuert Re-Mount bei Retry
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey])

  // ------ Render: Fehler-Zustand

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-claimondo-bg">
        <ErrorState
          title="Karte konnte nicht geladen werden"
          description={
            error === 'kein Token'
              ? 'Mapbox-Token fehlt — bitte NEXT_PUBLIC_MAPBOX_TOKEN setzen.'
              : 'Ein Fehler ist aufgetreten. Bitte erneut versuchen.'
          }
          retry={handleRetry}
          retryLabel="Erneut versuchen"
          className="max-w-sm"
        />
      </div>
    )
  }

  // ------ Render: Karte (+ Loading-Overlay bis ready)

  return (
    <div className="relative h-full w-full">
      {/* Mapbox-Container — inline inset statt Tailwind-inset (verhindert Klassen-Konflikt) */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
        aria-label="SV-Live-Ops-Karte"
      />

      {/* Loading-Overlay bis map.on('load') */}
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-claimondo-bg/80"
          aria-live="polite"
          aria-label="Karte wird geladen"
        >
          <div
            className="h-10 w-10 animate-spin rounded-ios-lg border-4 border-claimondo-border border-t-claimondo-navy"
            role="status"
          />
        </div>
      )}

      {/* data + role werden in Task 3+ fuer Layer genutzt */}
    </div>
  )
}
