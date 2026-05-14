'use client'

import { useState, useEffect, useRef } from 'react'
import { DownloadIcon, XIcon } from 'lucide-react'

// KFZ-171: PWA Install-Banner. Zeigt sich wenn beforeinstallprompt feuert
// und der User die App noch nicht installiert hat. Dismissable, merkt sich
// die Praeferenz in localStorage.

const DISMISSED_KEY = 'pwa-install-dismissed'

export default function PwaInstallBanner() {
  const [show, setShow] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(DISMISSED_KEY)) return
    // Already installed as PWA?
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      promptRef.current = e as BeforeInstallPromptEvent
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // CMM-14: SW-Registration zentral in ServiceWorkerBoot mit Delay.
  // Hier nicht mehr doppelt registrieren — vermeidet Install-Lifecycle-
  // Races wenn beide Mount-Points kollidieren.

  async function handleInstall() {
    if (!promptRef.current) return
    promptRef.current.prompt()
    const result = await promptRef.current.userChoice
    if (result.outcome === 'accepted') setShow(false)
    promptRef.current = null
  }

  function handleDismiss() {
    setShow(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-claimondo-navy text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Claimondo installieren</p>
        <p className="text-[11px] text-claimondo-ondo/50 mt-0.5">Schnellzugriff ohne Browser. Offline-fähig.</p>
      </div>
      <button
        onClick={handleInstall}
        className="flex items-center gap-1.5 bg-claimondo-ondo hover:bg-claimondo-light-blue text-white px-3 py-2 rounded-ios-xl text-xs font-semibold transition-colors flex-shrink-0"
      >
        <DownloadIcon className="w-3.5 h-3.5" /> Installieren
      </button>
      <button onClick={handleDismiss} className="text-claimondo-ondo/70 hover:text-white p-1 flex-shrink-0">
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// TypeScript: BeforeInstallPromptEvent is not in lib.dom.d.ts
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
