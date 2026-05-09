'use client'

import { useEffect, useState, useRef } from 'react'

// KFZ-158 Phase 2: Browser Geolocation watchPosition Hook.
// Liefert laufend die aktuelle GPS-Position mit Accuracy, Heading, Speed.
//
// 2026-05-08 (C13b) GPS-Last-Known-Resilience: SVs fahren oft durch
// Funklöcher / Tiefgaragen / Eifel-Tunnels wo GPS abreißt. Statt dann
// position=null zu liefern (würde TbT/Map blackouten), behalten wir den
// letzten guten Punkt + signalisieren via `isStale` + `staleSinceMs`
// dass die Position alt ist. UI zeigt das als "GPS unsicher seit 2 min"
// statt "GPS-Lost".

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
  // 2026-05-08 (C13b): isStale=true wenn die letzte gute Position älter
  // als STALE_THRESHOLD_MS ist. UI kann dann "GPS unsicher"-Hinweis
  // zeigen statt eine veraltete Live-Position als aktuell darzustellen.
  const [staleSinceMs, setStaleSinceMs] = useState<number | null>(null)
  const lastFreshPositionAtRef = useRef<number>(0)
  const watchIdRef = useRef<number | null>(null)
  const STALE_THRESHOLD_MS = 30_000 // 30 s ohne Update → isStale

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
          // C13b: fresh-Timestamp updaten + Stale-Flag löschen
          lastFreshPositionAtRef.current = Date.now()
          setStaleSinceMs(null)
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionState('denied')
            setError(err.message || 'GPS-Zugriff verweigert')
            // Bei Permission-Denied auch Position löschen — User muss
            // erst Permission geben, kein "Last-Known"-Halten.
            setPosition(null)
            setStaleSinceMs(null)
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
          // C13b: bei TIMEOUT/POSITION_UNAVAILABLE behalten wir die
          // letzte gute Position (Funkloch/Tiefgaragen). UI zeigt
          // staleSinceMs damit SV merkt dass die Live-Anzeige schon
          // älter ist.
          setError(err.message || (err.code === err.TIMEOUT ? 'GPS-Timeout' : 'GPS-Fehler'))
        },
        highAccuracy
          ? { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
          : { enableHighAccuracy: false, timeout: 30000, maximumAge: 30000 },
      )
    }
    startWatch(true)

    // C13b: alle 5 s prüfen ob die letzte gute Position älter als
    // STALE_THRESHOLD_MS ist. Wenn ja → setStaleSinceMs(age) damit UI
    // einen "GPS unsicher seit X min"-Hinweis zeigt.
    const staleCheckId = window.setInterval(() => {
      const lastFresh = lastFreshPositionAtRef.current
      if (lastFresh === 0) return
      const age = Date.now() - lastFresh
      if (age > STALE_THRESHOLD_MS) {
        setStaleSinceMs(age)
      }
    }, 5_000)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      window.clearInterval(staleCheckId)
    }
  }, [enabled])

  return { position, error, permissionState, staleSinceMs }
}
