'use client'

// CMM-32 Polish: Standort-Permission-CTA fuer das SV-Portal.
// Zeigt eine dezente Inline-Bar oben in der GutachterShell wenn der
// Browser noch keinen Standort-Grant hat. Ein Klick triggert den
// Permissions-Prompt; sobald der User „erlauben" klickt, schaltet
// useGeoPosition automatisch auf 'granted' und startet watchPosition
// ohne weiteren Eingriff.
//
// Bei 'denied' geht's nur ueber die Browser-Settings — wir zeigen
// einen dauerhaften Hinweis statt eines Buttons, weil der zweite
// getCurrentPosition()-Call dann sofort wieder fehlschlaegt.
//
// 'granted' und 'unsupported' rendern null — kein UI-Noise.

import { useState, useTransition } from 'react'
import { MapPinIcon, MapPinOffIcon } from 'lucide-react'
import type { GeoPermission } from '@/hooks/useGeoPosition'

type Props = {
  permission: GeoPermission
  onRequest: () => Promise<void>
}

export function GeoPermissionPrompt({ permission, onRequest }: Props) {
  const [pending, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState(false)

  if (permission === 'granted' || permission === 'unsupported') return null
  if (permission === 'prompt' && dismissed) return null

  if (permission === 'denied') {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 flex items-start gap-2 text-xs">
        <MapPinOffIcon className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-rose-900">Standort blockiert</p>
          <p className="text-rose-800 mt-0.5">
            Auto-ETA und Vor-Ort-Erkennung sind aus. In den Browser-Einstellungen
            unter „Standort" für Claimondo wieder erlauben — wir aktivieren das
            Tracking dann automatisch beim nächsten Termin.
          </p>
        </div>
      </div>
    )
  }

  // 'prompt' — Klick triggert Browser-Permission-Dialog
  return (
    <div className="rounded-xl border border-claimondo-border bg-white px-3 py-2 flex items-center gap-3 text-xs">
      <MapPinIcon className="w-4 h-4 text-claimondo-navy shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-claimondo-navy">Standort aktivieren</p>
        <p className="text-claimondo-ondo">
          Für Auto-ETA, Vor-Ort-Erkennung und „durchgeführt"-Trigger ohne manuelles
          Tippen. Wir tracken nur während aktiver Termin-Anfahrt.
        </p>
      </div>
      <button
        type="button"
        onClick={() => startTransition(() => void onRequest())}
        disabled={pending}
        className="rounded-md bg-claimondo-navy text-white text-xs font-medium px-3 py-1.5 hover:bg-claimondo-navy/90 disabled:opacity-50 shrink-0"
      >
        {pending ? 'Bitte bestätigen…' : 'Erlauben'}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-claimondo-ondo/60 hover:text-claimondo-ondo text-xs shrink-0"
      >
        Später
      </button>
    </div>
  )
}
