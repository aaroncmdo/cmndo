'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { DownloadIcon, XIcon } from 'lucide-react'
import {
  canOfferInstall,
  markShown,
  markDismissed,
  markInstalled,
  type BannerEnv,
} from '@/lib/pwa/install-banner-state'

// KFZ-171: PWA Install-Banner. Zeigt sich wenn beforeinstallprompt feuert.
// Regeln leben in @/lib/pwa/install-banner-state (dort getestet):
//   - hoechstens EINMAL pro Session (sessionStorage), danach kein Re-Pop
//   - nie, wenn die App bereits installiert ist (standalone / appinstalled)
//   - X = dauerhaft weg (localStorage)
// Frueher: der Handler rief bedingungslos setShow(true) und die Guards liefen nur
// beim Mount -> jeder erneute beforeinstallprompt liess den Banner wieder aufpoppen.

// Routen ohne PWA-Banner — Conversion-Surfaces auf denen der Banner stört.
// Aaron 18.05.2026: kfzgutachter-Ads-LP ist ein reines Ads-Funnel mit engem
// Above-the-Fold-Budget; ein „Installieren"-Prompt lenkt vom Lead-Formular ab.
const HIDE_ON_PATHS = ['/kfzgutachter-lp']

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false
  return HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// Fallback wenn localStorage/sessionStorage blockiert sind (Privacy-Mode): die
// Modul-Level-Maps halten den Zustand fuer die Lebensdauer des Tabs, sodass die
// „einmal pro Session"-Regel auch ohne echten Storage nicht zum Re-Pop wird.
const memLocal = new Map<string, string>()
const memSession = new Map<string, string>()
function mapStorage(m: Map<string, string>): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
  }
}
function pickStorage(kind: 'local' | 'session'): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    const probe = '__pwa_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return mapStorage(kind === 'local' ? memLocal : memSession)
  }
}
function readEnv(): BannerEnv {
  return {
    local: pickStorage('local'),
    session: pickStorage('session'),
    isStandalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari kennt kein display-mode standalone, dafuer navigator.standalone.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true,
  }
}

export default function PwaInstallBanner() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  // Zweiter Riegel gegen Re-Pop innerhalb desselben Mounts (unabhaengig vom Storage).
  const shownRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // appinstalled: sobald der Nutzer installiert -> dauerhaft merken + wegblenden.
    const onInstalled = () => {
      markInstalled(readEnv())
      shownRef.current = true
      setShow(false)
    }
    window.addEventListener('appinstalled', onInstalled)

    // Chrome kann beforeinstallprompt mehrfach pro Session feuern. Wir
    // preventDefault IMMER (unterdrueckt die Browser-Mini-Infobar) und zeigen
    // unseren Banner nur, wenn die Policy es in dieser Session noch erlaubt.
    const onPrompt = (e: Event) => {
      e.preventDefault()
      promptRef.current = e as BeforeInstallPromptEvent
      if (shownRef.current) return
      const env = readEnv()
      if (!canOfferInstall(env)) return
      shownRef.current = true
      markShown(env)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    return () => {
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  // CMM-14: SW-Registration zentral in ServiceWorkerBoot mit Delay.
  // Hier nicht doppelt registrieren — vermeidet Install-Lifecycle-Races.

  async function handleInstall() {
    if (!promptRef.current) return
    promptRef.current.prompt()
    const result = await promptRef.current.userChoice
    if (result.outcome === 'accepted') {
      // Falls appinstalled ausbleibt (nicht garantiert) -> selbst merken.
      markInstalled(readEnv())
      setShow(false)
    }
    promptRef.current = null
  }

  function handleDismiss() {
    setShow(false)
    shownRef.current = true
    markDismissed(readEnv())
  }

  if (shouldHide(pathname)) return null
  if (!show) return null

  // Aaron 20.05.2026: oben rechts unter dem Header. z-40 reicht durch das Top-Offset.
  return (
    <div className="fixed top-16 md:top-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-40 bg-claimondo-navy text-white rounded-ios-md p-4 shadow-ios-lg flex items-center gap-3 animate-in slide-in-from-top">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Claimondo installieren</p>
        <p className="text-[11px] text-white/70 mt-0.5">Schnellzugriff ohne Browser. Offline-fähig.</p>
      </div>
      <button
        onClick={handleInstall}
        className="flex items-center gap-1.5 bg-claimondo-ondo hover:bg-claimondo-light-blue text-white px-3 py-2 rounded-ios-xl text-xs font-semibold transition-colors flex-shrink-0"
      >
        <DownloadIcon className="w-3.5 h-3.5" /> Installieren
      </button>
      <button onClick={handleDismiss} aria-label="Banner schließen" className="text-claimondo-ondo/70 hover:text-white p-1 flex-shrink-0">
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
