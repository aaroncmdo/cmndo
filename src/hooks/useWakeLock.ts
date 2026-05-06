'use client'

// Portal-Review SV1: Screen-Wake-Lock für den Feldmodus.
// Verhindert dass der Bildschirm während aktiver Tagesroute ausgeht
// — sonst muss der SV alle paar Minuten das Telefon entsperren um auf
// die Karte zu schauen, was beim Fahren gefährlich ist.
//
// API-Hinweise:
// - navigator.wakeLock.request('screen') ist nicht überall verfügbar
//   (alte iOS-Safari-Versionen, Firefox-Android in einigen Builds).
//   Wir failen leise; der Modus bleibt nutzbar, der Display geht halt
//   nach Geräte-Default aus.
// - Wenn der Tab in den Hintergrund geht (visibilitychange → hidden),
//   gibt der Browser den Wake-Lock automatisch frei. Wir reaquirieren
//   beim Zurückkehren — damit überlebt der Lock auch kurze Telefonate.
// - Der Hook gibt den Lock beim Unmount oder wenn `active=false` wird
//   sauber wieder frei.

import { useEffect, useRef, useState } from 'react'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

export type WakeLockStatus =
  | 'idle' // Hook inaktiv (active=false)
  | 'unsupported' // Browser kann keine WakeLock
  | 'pending' // Request läuft
  | 'active' // Lock erfolgreich gehalten
  | 'failed' // Request hat geworfen (z.B. iOS-PWA-Quirk)

export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('idle')
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nav = window.navigator as NavigatorWithWakeLock

    if (!active) {
      setStatus('idle')
      const s = sentinelRef.current
      if (s && !s.released) {
        s.release().catch(() => {
          /* noop — Browser räumt eh auf */
        })
      }
      sentinelRef.current = null
      return
    }

    if (!nav.wakeLock) {
      setStatus('unsupported')
      return
    }

    let cancelled = false

    const acquire = async () => {
      if (cancelled || sentinelRef.current) return
      setStatus('pending')
      try {
        const sentinel = await nav.wakeLock!.request('screen')
        if (cancelled) {
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        setStatus('active')
        sentinel.addEventListener('release', () => {
          // Vom Browser freigegeben (Tab-Switch etc.). Marker löschen,
          // damit der Visibility-Listener neu acquiren kann.
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null
          }
        })
      } catch {
        if (!cancelled) setStatus('failed')
      }
    }

    void acquire()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active) {
        void acquire()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      const s = sentinelRef.current
      if (s && !s.released) {
        s.release().catch(() => {})
      }
      sentinelRef.current = null
    }
  }, [active])

  return status
}
