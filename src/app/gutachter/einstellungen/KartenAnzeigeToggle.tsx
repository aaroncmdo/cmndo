'use client'

// 2026-05-08 Aaron-Brief: Toggle „Mein Gebiet auf Karte zeigen" — steuert
// ob das Isochrone-Polygon des SV im Heute-Hub als leuchtende Fläche
// angezeigt wird. State persistiert in LocalStorage damit's über
// Sessions hinweg klebt — kein DB-Schema-Change nötig.

import { useEffect, useState } from 'react'
import { MapIcon } from 'lucide-react'

export const KARTEN_GEBIET_LS_KEY = 'claimondo_show_gebiet_in_hub'

export default function KartenAnzeigeToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null) // null = noch nicht aus LS gelesen

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(KARTEN_GEBIET_LS_KEY)
    setEnabled(stored === '1')
  }, [])

  function toggle() {
    const next = !enabled
    setEnabled(next)
    try {
      window.localStorage.setItem(KARTEN_GEBIET_LS_KEY, next ? '1' : '0')
      // Custom-Event damit andere offene Tabs/Cards (Hub-Map) den Wechsel
      // sofort picken können ohne Page-Reload.
      window.dispatchEvent(new CustomEvent('claimondo:gebiet-toggle', { detail: next }))
    } catch { /* localStorage might be disabled */ }
  }

  if (enabled === null) {
    return (
      <div className="flex items-start gap-4 bg-white border border-claimondo-border rounded-2xl p-4 opacity-60">
        <div className="w-10 h-10 rounded-xl bg-claimondo-ondo/10 flex items-center justify-center flex-shrink-0">
          <MapIcon className="w-5 h-5 text-claimondo-ondo" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-claimondo-navy">Mein Gebiet auf Karte</p>
          <p className="text-xs text-claimondo-ondo mt-1">Lade …</p>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-full flex items-start gap-4 bg-white border border-claimondo-border rounded-2xl p-4 hover:border-claimondo-ondo transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-claimondo-ondo/10 flex items-center justify-center flex-shrink-0">
        <MapIcon className="w-5 h-5 text-claimondo-ondo" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-claimondo-navy">Mein Gebiet auf Karte</p>
          <span
            className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              enabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border'
            }`}
          >
            {enabled ? 'An' : 'Aus'}
          </span>
        </div>
        <p className="text-xs text-claimondo-ondo mt-1">
          Zeigt dein Anfahrts-Gebiet als leuchtende Grenz-Fläche im Heute-Hub. Hilft dir
          Termine außerhalb deiner Reichweite auf einen Blick zu erkennen.
        </p>
      </div>
      <span
        aria-hidden
        className={`mt-1 relative inline-flex items-center h-6 w-11 rounded-full transition-colors flex-shrink-0 ${
          enabled ? 'bg-[var(--brand-primary)]' : 'bg-claimondo-border'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
