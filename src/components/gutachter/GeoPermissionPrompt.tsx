'use client'

// CMM-32 Polish: Standort-Permission-CTA fuer das SV-Portal.
//
// 2026-05-07 (Design-Review-Iteration): Banner war auf allen 24 Routen
// permanent oben sichtbar — auf Mobile bis zu 18 % der Viewport-Hoehe.
// SV in /profil oder /abrechnung braucht aber kein GPS. Jetzt:
//   - nur auf Routen wo Live-Location Mehrwert liefert (Heute, Feldmodus,
//     Aufträge — die Standort-getriggerten Flows)
//   - Mobile zeigt nur Pill-Icon + Erlauben-Button (kein 4-Zeilen-Text)
//   - „Später" snoozt fuer 7 Tage via localStorage statt nur 1 Render
//   - Glass-Style mit backdrop-blur passend zu Heute-Sidebar
//
// 'granted' und 'unsupported' rendern null — kein UI-Noise.

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { MapPinIcon, MapPinOffIcon, XIcon } from 'lucide-react'
import type { GeoPermission } from '@/hooks/useGeoPosition'

type Props = {
  permission: GeoPermission
  onRequest: () => Promise<void>
}

/**
 * Routen auf denen der Standort-Banner relevant ist. Match via `startsWith` —
 * `/gutachter/auftraege/123/...` greift auch.
 */
const ROUTES_WITH_BANNER = [
  '/gutachter/heute',
  '/gutachter/feldmodus',
  '/gutachter/auftraege',
] as const

const SNOOZE_KEY = 'geo-prompt-snooze-until'
const SNOOZE_DAYS = 7

function getSnoozeUntil(): number {
  if (typeof window === 'undefined') return 0
  try {
    return Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0)
  } catch {
    return 0
  }
}

export function GeoPermissionPrompt({ permission, onRequest }: Props) {
  const [pending, startTransition] = useTransition()
  const [snoozedUntil, setSnoozedUntil] = useState<number>(0)
  const pathname = usePathname() ?? ''

  // Snooze nach Mount aus localStorage lesen — vermeidet SSR-Hydration-Mismatch.
  useEffect(() => {
    setSnoozedUntil(getSnoozeUntil())
  }, [])

  // Route-Filter: nur auf Standort-relevanten Pfaden anzeigen.
  const onRelevantRoute = ROUTES_WITH_BANNER.some((r) => pathname.startsWith(r))
  if (!onRelevantRoute) return null

  if (permission === 'granted' || permission === 'unsupported') return null
  if (Date.now() < snoozedUntil) return null

  if (permission === 'denied') {
    return (
      <div className="mb-3 rounded-ios-xl border border-red-200 bg-red-50/80 backdrop-blur-md px-3 py-2 flex items-center gap-2 text-xs">
        <MapPinOffIcon className="w-4 h-4 text-red-700 shrink-0" />
        <p className="flex-1 text-red-900 truncate">
          <span className="font-medium">Standort blockiert.</span>{' '}
          <span className="hidden sm:inline">In Browser-Settings für Claimondo wieder erlauben.</span>
          <span className="sm:hidden">Browser-Settings öffnen.</span>
        </p>
      </div>
    )
  }

  function handleSnooze() {
    const until = Date.now() + SNOOZE_DAYS * 86_400_000
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(until))
    } catch { /* private mode etc. */ }
    setSnoozedUntil(until)
  }

  // 'prompt' — Glass-Pill, kompakt: Mobile nur Icon+Buttons, Desktop ein Satz.
  return (
    <div className="mb-3 rounded-ios-xl border border-white/40 bg-white/65 backdrop-blur-md shadow-ios-sm px-3 py-2 flex items-center gap-2 text-xs">
      <MapPinIcon className="w-4 h-4 text-claimondo-navy shrink-0" />
      <p className="flex-1 min-w-0 text-claimondo-navy truncate">
        <span className="hidden sm:inline">
          Standort an für Auto-ETA &amp; Termin-Tracking
        </span>
        <span className="sm:hidden font-medium">Standort?</span>
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => void onRequest())}
        disabled={pending}
        className="rounded-ios-md bg-claimondo-navy text-white text-xs font-medium px-3 py-1 hover:bg-claimondo-ondo disabled:opacity-50 shrink-0"
      >
        {pending ? '…' : 'Erlauben'}
      </button>
      <button
        type="button"
        onClick={handleSnooze}
        className="text-claimondo-ondo/70 hover:text-claimondo-navy p-1 shrink-0"
        title="7 Tage ausblenden"
        aria-label="Standort-Hinweis 7 Tage ausblenden"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
