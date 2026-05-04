'use client'

// TbT-Banner: oben am Bildschirm, zeigt nächstes Maneuver mit
// Pfeil-Icon + Distance + Anweisung. Voice-Toggle rechts.

import {
  ArrowUpIcon,
  ArrowUpLeftIcon,
  ArrowUpRightIcon,
  CornerUpLeftIcon,
  CornerUpRightIcon,
  RotateCwIcon,
  FlagIcon,
  Volume2Icon,
  VolumeXIcon,
  Loader2Icon,
} from 'lucide-react'
import type { TbtStep } from '@/lib/mapbox/turn-by-turn'

function pickIcon(step: TbtStep): typeof ArrowUpIcon {
  const t = step.maneuverType
  const m = step.maneuverModifier ?? ''
  if (t === 'arrive') return FlagIcon
  if (t === 'roundabout' || t === 'rotary') return RotateCwIcon
  if (t === 'turn') {
    if (m.includes('sharp left') || m === 'left') return CornerUpLeftIcon
    if (m.includes('sharp right') || m === 'right') return CornerUpRightIcon
    if (m === 'slight left') return ArrowUpLeftIcon
    if (m === 'slight right') return ArrowUpRightIcon
    return ArrowUpIcon
  }
  if (m === 'left') return CornerUpLeftIcon
  if (m === 'right') return CornerUpRightIcon
  return ArrowUpIcon
}

function formatDistance(meters: number | null): string {
  if (meters == null) return '—'
  if (meters < 50) return 'Jetzt'
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export interface TbtBannerProps {
  step: TbtStep | null
  distanceToManeuverMeters: number | null
  voiceEnabled: boolean
  onToggleVoice: () => void
  /** Gesamt-ETA bis Ziel in Sekunden (optional) */
  totalDurationSec?: number | null
  totalDistanceMeters?: number | null
  /** Wenn true → Re-Routing läuft, Banner zeigt einen Indikator */
  rerouting?: boolean
}

export default function TbtBanner({
  step,
  distanceToManeuverMeters,
  voiceEnabled,
  onToggleVoice,
  totalDurationSec,
  totalDistanceMeters,
  rerouting = false,
}: TbtBannerProps) {
  if (!step) return null
  const Icon = pickIcon(step)
  const primary = step.bannerInstructions[0]?.primary
  const secondary = step.bannerInstructions[0]?.secondary
  const headline = primary?.text ?? step.instruction
  const subline = secondary?.text ?? step.name

  return (
    <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none space-y-2">
      {/* Re-Routing-Pill — schmaler Hinweis über dem Haupt-Banner */}
      {rerouting && (
        <div className="bg-amber-500/95 backdrop-blur-sm text-white rounded-full shadow-lg px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2 mx-auto w-fit pointer-events-auto">
          <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
          Neue Route wird berechnet …
        </div>
      )}
      <div className="bg-claimondo-navy/95 backdrop-blur-sm text-white rounded-2xl shadow-xl pointer-events-auto overflow-hidden">
        <div className="flex items-stretch">
          {/* Icon + Distance */}
          <div className="bg-claimondo-ondo/30 flex flex-col items-center justify-center px-4 py-3 w-24 shrink-0">
            <Icon className="w-7 h-7 text-white mb-0.5" />
            <span className="text-xs font-bold whitespace-nowrap">
              {formatDistance(distanceToManeuverMeters)}
            </span>
          </div>
          {/* Anweisung */}
          <div className="flex-1 px-4 py-3 min-w-0">
            <p className="text-base font-semibold leading-tight">{headline}</p>
            {subline && (
              <p className="text-xs text-white/70 mt-0.5 truncate">{subline}</p>
            )}
            {(totalDurationSec != null || totalDistanceMeters != null) && (
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-white/60">
                {totalDurationSec != null && (
                  <span>
                    {Math.floor(totalDurationSec / 60) >= 60
                      ? `${Math.floor(totalDurationSec / 3600)}h ${Math.floor((totalDurationSec % 3600) / 60)}min`
                      : `${Math.round(totalDurationSec / 60)} min`}
                  </span>
                )}
                {totalDistanceMeters != null && (
                  <>
                    <span>·</span>
                    <span>{(totalDistanceMeters / 1000).toFixed(1)} km</span>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Voice-Toggle */}
          <button
            type="button"
            onClick={onToggleVoice}
            className="flex items-center justify-center w-12 shrink-0 hover:bg-white/10 transition-colors"
            aria-label={voiceEnabled ? 'Voice ausschalten' : 'Voice einschalten'}
          >
            {voiceEnabled ? (
              <Volume2Icon className="w-5 h-5 text-white" />
            ) : (
              <VolumeXIcon className="w-5 h-5 text-white/60" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
