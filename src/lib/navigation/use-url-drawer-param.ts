'use client'
// URL-synchronisierter Drawer-Zustand (CRM: ?kontakt=<kind>:<id>, ?aktion=<key>, ?lead=<id>).
//
// Muster: die URL ist die Single Source of Truth — der Drawer-open-Zustand wird aus
// useSearchParams() ABGELEITET (kein paralleler useState). Next 15 synct useSearchParams
// bei nativen history.pushState/replaceState-Aufrufen (shallow routing) und bei popstate
// (Browser-Back) automatisch — dadurch:
//   - Deep-Link ?kontakt=… oeffnet den Drawer direkt beim Mount
//   - Browser-Back schliesst den Drawer statt die Liste zu verlassen
//   - Filter/Scroll/Pills bleiben erhalten (kein Router-Nav, kein RSC-Refetch)
//
// close(): wenn WIR den Eintrag gepusht haben → history.back() (Back-Stack bleibt sauber);
// wenn der Drawer per Deep-Link/Reload offen war → replaceState ohne Param (kein Verlassen
// der Seite durch back()). Gezaehlt wird per Instanz-Ref + popstate-Listener (History-State
// gehoert in Next dem Router — dort nichts hineinschreiben).
import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { setSearchParam } from './url-drawer'

export function useUrlDrawerParam(key: string): {
  value: string | null
  open: (value: string, opts?: { alsoRemove?: string[] }) => void
  close: () => void
} {
  const searchParams = useSearchParams()
  const value = searchParams.get(key)
  // Anzahl der von DIESER Instanz gepushten History-Eintraege (fuer close→back vs. replace).
  const pushedRef = useRef(0)

  // Browser-Back konsumiert unseren gepushten Eintrag → Zaehler nachziehen.
  useEffect(() => {
    function onPop() {
      const now = new URLSearchParams(window.location.search).get(key)
      if (!now && pushedRef.current > 0) pushedRef.current -= 1
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [key])

  const open = useCallback(
    (next: string, opts?: { alsoRemove?: string[] }) => {
      const search = setSearchParam(window.location.search, key, next, opts?.alsoRemove ?? [])
      const url = `${window.location.pathname}${search}`
      const bereitsOffen = new URLSearchParams(window.location.search).get(key) !== null
      if (bereitsOffen) {
        // Wechsel innerhalb des offenen Drawers (andere Zeile) → KEIN neuer History-Eintrag,
        // sonst muss der Nutzer per Back durch jede angeklickte Zeile zurueck.
        // state=null wie in der Next-Doku — Nexts Router-State nicht duplizieren/anfassen.
        window.history.replaceState(null, '', url)
      } else {
        window.history.pushState(null, '', url)
        pushedRef.current += 1
      }
    },
    [key],
  )

  const close = useCallback(() => {
    if (pushedRef.current > 0) {
      pushedRef.current -= 1
      window.history.back()
      return
    }
    // Deep-Link-/Reload-Fall: Param entfernen ohne die Seite zu verlassen.
    const search = setSearchParam(window.location.search, key, null)
    window.history.replaceState(null, '', `${window.location.pathname}${search}`)
  }, [key])

  return { value, open, close }
}
