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

    // 2026-05-08 (Smoke + Browser-Compat): zwei-stufiger watchPosition-
    // Setup. Erst high-accuracy (echte SVs auf Smartphones brauchen das
    // für das Fahrzeug-GPS). Wenn das mit TIMEOUT (code 3) failt — passiert
    // im Browser ohne Hardware-GPS oder wenn der Chip nicht antworten kann
    // (Playwright headless, Desktop-Browser ohne GPS) — fallback auf
    // low-accuracy Wifi/IP-Geolocation mit längerem Timeout. So sieht der
    // useFieldTracking-Caller in beiden Fällen eine valid Position statt
    // einer leeren „Timeout expired"-Meldung.
    let highAccuracyFailed = false
    const startWatch = (highAccuracy: boolean) => {
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
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionState('denied')
            setError(err.message || 'GPS-Zugriff verweigert')
            return
          }
          if (err.code === err.TIMEOUT && highAccuracy && !highAccuracyFailed) {
            highAccuracyFailed = true
            if (watchIdRef.current !== null) {
              navigator.geolocation.clearWatch(watchIdRef.current)
            }
            startWatch(false)
            return
          }
          // Sonstige Fehler durchreichen, mit Fallback-Message wenn der
          // Browser einen leeren err.message liefert (passiert bei iOS-
          // Safari TIMEOUT-Fall ohne Detail).
          setError(err.message || (err.code === err.TIMEOUT ? 'GPS-Timeout — bitte nochmal versuchen' : 'GPS-Fehler'))
        },
        highAccuracy
          ? { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
          : { enableHighAccuracy: false, timeout: 30000, maximumAge: 30000 },
      )
    }
    startWatch(true)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [enabled])

  return { position, error, permissionState }
}
