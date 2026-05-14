'use client'

import { useState } from 'react'
import { CheckIcon, Loader2Icon } from 'lucide-react'
import { BRAND_PRESETS, type BrandPreset } from '@/lib/branding/theme-presets'

// 2026-05-14: Card-Grid mit kuratierten Brand-Presets für SVs die kein
// eigenes Logo haben oder die schnell zwischen "Auto-Werkstatt-Stilen"
// wechseln wollen. Klick auf eine Card löst die Server-Action aus
// (props.onApply) und feuert die globale Brand-Transition.

export type BrandPresetPickerProps = {
  /** Aktuell aktive Preset-ID (für Selected-State), null wenn keine. */
  activePresetId?: string | null
  /** Server-Action — bekommt die preset-ID, soll true zurückgeben wenn erfolgreich. */
  onApply: (preset: BrandPreset) => Promise<boolean>
  /** Optional: Filter — nur diese Presets anzeigen. */
  presets?: BrandPreset[]
  className?: string
}

export default function BrandPresetPicker({
  activePresetId,
  onApply,
  presets,
  className = '',
}: BrandPresetPickerProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const items = presets ?? BRAND_PRESETS

  async function handleClick(preset: BrandPreset) {
    if (busyId) return
    setBusyId(preset.id)
    try {
      const ok = await onApply(preset)
      if (ok && typeof window !== 'undefined') {
        // Globale 1.2s Brand-Transition triggern (siehe globals.css).
        document.body.setAttribute('data-brand-transition', 'on')
        localStorage.setItem('brand-just-changed', String(Date.now()))
        setTimeout(() => {
          document.body.removeAttribute('data-brand-transition')
        }, 1500)
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${className}`}>
      {items.map(p => {
        const active = activePresetId === p.id
        const busy = busyId === p.id
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => handleClick(p)}
            disabled={!!busyId}
            className={`relative text-left rounded-ios-md border-2 p-4 transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed ${
              active
                ? 'border-claimondo-ondo shadow-claimondo-md'
                : 'border-claimondo-border hover:border-claimondo-ondo/60'
            }`}
            style={{ backgroundColor: '#ffffff' }}
            aria-pressed={active}
          >
            {/* Color-Swatch-Row */}
            <div className="flex items-center gap-1.5 mb-3">
              <div
                className="h-8 w-8 rounded-ios-sm border border-black/5"
                style={{ backgroundColor: p.primary }}
              />
              <div
                className="h-8 w-8 rounded-ios-sm border border-black/5"
                style={{ backgroundColor: p.secondary }}
              />
              <div
                className="h-8 w-8 rounded-ios-sm border border-black/5"
                style={{ backgroundColor: p.accent }}
              />
              {active && (
                <div className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full bg-claimondo-ondo text-white">
                  <CheckIcon className="w-3.5 h-3.5" />
                </div>
              )}
              {busy && (
                <div className="ml-auto">
                  <Loader2Icon className="w-4 h-4 animate-spin text-claimondo-ondo" />
                </div>
              )}
            </div>
            <p className="text-sm font-semibold leading-tight" style={{ color: '#0D1B3E' }}>
              {p.label}
            </p>
            <p className="text-[11px] mt-1 leading-snug" style={{ color: '#4A5568' }}>
              {p.description}
            </p>
          </button>
        )
      })}
    </div>
  )
}
