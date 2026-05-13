// KFZ-180 + BUG-01: React Hook fuer Online/Offline-Status-Detection.
// Doppelte Pruefung: navigator.onLine + aktiver Ping an /api/health.
// Debounce: Banner erst nach 3s Offline anzeigen, sofort weg bei Online.

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkConnection = useCallback(async () => {
    // 1. Browser-API (schneller Negativtest)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // Debounce: erst nach 3s als offline markieren
      if (debounceRef.current === null) {
        debounceRef.current = setTimeout(() => setIsOnline(false), 3000)
      }
      return
    }

    // 2. Aktiver Ping (bestaetigt echte Konnektivitaet)
    try {
      const res = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        // Sofort online markieren + Debounce abbrechen
        if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
        setIsOnline(true)
      } else {
        if (debounceRef.current === null) {
          debounceRef.current = setTimeout(() => setIsOnline(false), 3000)
        }
      }
    } catch {
      if (debounceRef.current === null) {
        debounceRef.current = setTimeout(() => setIsOnline(false), 3000)
      }
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkConnection()

    // Browser events
    const handleOnline = () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      setIsOnline(true)
      checkConnection()
    }
    const handleOffline = () => checkConnection()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Polling: 60s wenn online, 30s wenn offline (vorher 10s → zu aggressiv)
    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(checkConnection, isOnline ? 60000 : 30000)
    }
    startPolling()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [checkConnection, isOnline])

  return isOnline
}
