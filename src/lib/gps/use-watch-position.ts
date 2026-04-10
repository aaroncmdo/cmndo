'use client'

import { useEffect, useState, useRef } from 'react'

// KFZ-158 Phase 2: Browser Geolocation watchPosition Hook.
// Liefert laufend die aktuelle GPS-Position mit Accuracy, Heading, Speed.

export interface GpsPosition {
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  speed: number | null
}

export function useWatchPosition(enabled: boolean) {
  const [position, setPosition] = useState<GpsPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<'pending' | 'granted' | 'denied'>('pending')
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation nicht verfügbar')
      return
    }

    // Check permission state if API available
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') setPermissionState('granted')
        else if (result.state === 'denied') setPermissionState('denied')
        result.addEventListener('change', () => {
          setPermissionState(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'pending')
        })
      }).catch(() => {})
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        })
        setPermissionState('granted')
        setError(null)
      },
      (err) => {
        setError(err.message)
        if (err.code === err.PERMISSION_DENIED) setPermissionState('denied')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [enabled])

  return { position, error, permissionState }
}
