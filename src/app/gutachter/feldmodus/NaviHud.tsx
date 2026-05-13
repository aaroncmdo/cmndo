'use client'

// 2026-05-08 (C10) NaviHud — eine zentrale, bottom-mittige Glass-
// Notification-Card im Feldmodus. Konsolidiert Blitzer/Hazard/Reroute/
// Maneuver/Lane-Guidance in EINEN visuellen Slot statt sie auf
// verschiedene Banner-Positions zu verteilen.
//
// Aaron-Direction:
//   - Blitzer  → rot-glass     („immediate safety")
//   - Stau/Unfall → gelb-glass („route impact, choice required")
//   - Spurentscheidung → blau-glass + Lane-Indikator
//   - Maneuver / Reroute → blau-glass
//   - Position: bottom-center, prominent
//   - Transition: fade-in + slide-up + blur-in beim Erscheinen
//
// Prio-Stack (höchste prio gewinnt wenn mehrere Notices gleichzeitig):
//   1. blitzer   (Sicherheit, sofort, kurz)
//   2. hazard    (Hindernis voraus)
//   3. reroute   (Wechsel-Vorschlag)
//   4. lane      (Spur-Choice am Maneuver)
//   5. maneuver  (Standard-Turn-Anweisung)
//
// Architektur: Pure Presentation. State + Notice-Building geschieht im
// Caller (FeldmodusClient + FeldmodusMap-Callback). NaviHud rendert nur
// das aktuell höchste Notice.

import { useEffect, useRef, useState } from 'react'
import {
  ZapIcon,
  AlertTriangleIcon,
  ConstructionIcon,
  CornerUpRightIcon,
  CornerUpLeftIcon,
  ArrowUpIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  GaugeIcon,
  RouteIcon,
} from 'lucide-react'

// 2026-05-08 (C10c): Auto-Accept-Dauer beim Reroute-Toast — 10s passiv,
// dann switcht auf die Alternative. Gibt dem SV Zeit zu reagieren ohne
// ihn aus dem Fahrfokus zu reißen.
const REROUTE_AUTO_ACCEPT_MS = 10_000

// ─── Notice-Types ────────────────────────────────────────────────────

export type NaviNotice =
  | {
      type: 'blitzer'
      mobile: boolean
      distanceLabel: string
      vmaxKmh?: number | null
    }
  | {
      type: 'hazard'
      label: string
      distanceLabel?: string
      etaCostMin?: number | null
    }
  | {
      type: 'reroute'
      reason: 'faster' | 'hazard'
      etaSavedSec: number
      hazardLabel?: string
      onAccept: () => void
      onDismiss: () => void
    }
  | {
      type: 'lane'
      /** Pro Spur ein Eintrag (von links nach rechts).
       *  active=true → aktive Spur, sonst grau. */
      lanes: Array<{ active: boolean; directions: string[] }>
      maneuverInstruction: string
      distanceLabel: string
    }
  | {
      type: 'maneuver'
      /** 'turn' | 'merge' | 'fork' | 'roundabout' | 'depart' | 'arrive' | … */
      maneuverType: string
      modifier: string | null
      instruction: string
      distanceLabel: string
      streetName?: string | null
    }

// ─── Mode-Themes (Aaron-Direction) ───────────────────────────────────

type Theme = {
  /** Glass-tint background. */
  bg: string
  /** Border-Akzent. */
  border: string
  /** Icon-Farbe für hauptsächliches Icon. */
  iconColor: string
  /** Icon-Container-bg. */
  iconBg: string
  /** Title-Text-Farbe. */
  title: string
  /** Body-Text-Farbe. */
  body: string
}

const THEME_RED: Theme = {
  bg: 'bg-red-500/20 backdrop-blur-2xl',
  border: 'border-red-400/60',
  iconColor: 'text-white',
  iconBg: 'bg-red-500/80',
  title: 'text-white',
  body: 'text-red-50/90',
}

const THEME_AMBER: Theme = {
  bg: 'bg-amber-400/25 backdrop-blur-2xl',
  border: 'border-amber-300/70',
  iconColor: 'text-amber-950',
  iconBg: 'bg-amber-300',
  title: 'text-amber-950',
  body: 'text-amber-900/90',
}

const THEME_BLUE: Theme = {
  bg: 'bg-claimondo-ondo/20 backdrop-blur-2xl',
  border: 'border-blue-400/60',
  iconColor: 'text-white',
  iconBg: 'bg-claimondo-ondo',
  title: 'text-white',
  body: 'text-claimondo-light-blue/90',
}

// 2026-05-08 (Aaron-Brief): Standard-Abbiegungen (Maneuver) sollen NICHT
// blau sein — blau ist reserviert für Spurentscheidungen + Reroute. Die
// gewöhnliche „Rechts in 200 m"-Anweisung kommt im weißen Glass-Look.
const THEME_WHITE: Theme = {
  bg: 'bg-white/65 backdrop-blur-2xl',
  border: 'border-white/60',
  iconColor: 'text-claimondo-navy',
  iconBg: 'bg-white/85',
  title: 'text-claimondo-navy',
  body: 'text-claimondo-ondo',
}

function themeFor(notice: NaviNotice): Theme {
  switch (notice.type) {
    case 'blitzer':
      return THEME_RED
    case 'hazard':
      return THEME_AMBER
    case 'maneuver':
      return THEME_WHITE
    case 'reroute':
    case 'lane':
    default:
      return THEME_BLUE
  }
}

// ─── Maneuver-Icon-Mapping ───────────────────────────────────────────

function ManeuverIcon({
  maneuverType,
  modifier,
  className,
}: {
  maneuverType: string
  modifier: string | null
  className: string
}) {
  // Mapbox liefert primary-modifier als 'left' | 'right' | 'sharp left' |
  // 'slight right' | 'straight' | 'uturn' etc.
  const mod = (modifier ?? '').toLowerCase()
  if (mod.includes('left') && !mod.includes('uturn')) {
    return mod.includes('slight') ? <ArrowLeftIcon className={className} /> : <CornerUpLeftIcon className={className} />
  }
  if (mod.includes('right')) {
    return mod.includes('slight') ? <ArrowRightIcon className={className} /> : <CornerUpRightIcon className={className} />
  }
  if (mod.includes('straight') || maneuverType === 'continue') {
    return <ArrowUpIcon className={className} />
  }
  // Fallback
  return <ArrowUpIcon className={className} />
}

// ─── Lane-Indikator ──────────────────────────────────────────────────

function LaneIndicator({ lanes }: { lanes: Array<{ active: boolean; directions: string[] }> }) {
  return (
    <div className="flex items-end gap-1.5">
      {lanes.map((lane, i) => {
        const dir = lane.directions[0] ?? 'straight'
        const Icon = dir.includes('left') ? CornerUpLeftIcon : dir.includes('right') ? CornerUpRightIcon : ArrowUpIcon
        return (
          <div
            key={i}
            className={`w-7 h-9 rounded-md flex items-center justify-center transition-all ${
              lane.active ? 'bg-white text-claimondo-navy scale-105 shadow-md' : 'bg-white/20 text-white/40'
            }`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )
      })}
    </div>
  )
}

// ─── NaviHud Component ───────────────────────────────────────────────

export interface NaviHudProps {
  notice: NaviNotice | null
}

export default function NaviHud({ notice }: NaviHudProps) {
  // Trigger-Animation bei Notice-Wechsel — key forciert React-Re-Mount
  // sodass die fade-in-from-bottom Tailwind-Animation neu greift.
  const [renderKey, setRenderKey] = useState(0)
  useEffect(() => {
    if (notice) setRenderKey((k) => k + 1)
  }, [notice?.type, (notice as { distanceLabel?: string })?.distanceLabel])

  if (!notice) return null
  const theme = themeFor(notice)

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(560px,92vw)] px-2">
      <div
        key={renderKey}
        // 2026-05-08 (Aaron-Brief): NaviHud sollte sich wie die anderen
        // Glass-Cards anfühlen — kein dramatischer drop-shadow, nur
        // Backdrop-Blur + dezenter ios-Shadow wie GlassPanel. Vorher
        // shadow-2xl shadow-black/40 wirkte wie ein aufgepfropfter Toast.
        className={`pointer-events-auto rounded-2xl ${theme.bg} ${theme.border} border shadow-ios-md overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500`}
      >
        <NoticeContent notice={notice} theme={theme} />
      </div>
    </div>
  )
}

function NoticeContent({ notice, theme }: { notice: NaviNotice; theme: Theme }) {
  switch (notice.type) {
    case 'blitzer':
      return (
        <div className="flex items-center gap-4 px-5 py-4">
          <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${theme.iconBg}`}>
            <ZapIcon className={`w-6 h-6 ${theme.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-base font-bold ${theme.title} leading-tight`}>
              {notice.mobile ? 'Mobiler Blitzer' : 'Blitzer'} in {notice.distanceLabel}
            </p>
            {notice.vmaxKmh != null && (
              <p className={`text-xs ${theme.body} mt-0.5`}>
                Tempolimit {notice.vmaxKmh} km/h
              </p>
            )}
          </div>
          {notice.vmaxKmh != null && (
            <div className="shrink-0 flex items-center gap-1.5 rounded-full bg-white/90 text-red-700 px-3 py-1.5 text-sm font-bold">
              <GaugeIcon className="w-4 h-4" />
              {notice.vmaxKmh}
            </div>
          )}
        </div>
      )

    case 'hazard':
      return (
        <div className="flex items-center gap-4 px-5 py-4">
          <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${theme.iconBg}`}>
            <ConstructionIcon className={`w-6 h-6 ${theme.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-base font-bold ${theme.title} leading-tight`}>
              {notice.label}
            </p>
            {notice.distanceLabel && (
              <p className={`text-xs ${theme.body} mt-0.5`}>
                in {notice.distanceLabel}
                {notice.etaCostMin != null && ` · +${notice.etaCostMin} min Verzögerung`}
              </p>
            )}
          </div>
        </div>
      )

    case 'reroute':
      return <RerouteCard notice={notice} theme={theme} />


    case 'lane':
      return (
        <div className="flex items-center gap-4 px-5 py-4">
          <LaneIndicator lanes={notice.lanes} />
          <div className="flex-1 min-w-0">
            <p className={`text-base font-bold ${theme.title} leading-tight`}>
              {notice.maneuverInstruction}
            </p>
            <p className={`text-xs ${theme.body} mt-0.5`}>in {notice.distanceLabel}</p>
          </div>
        </div>
      )

    case 'maneuver':
      return (
        <div className="flex items-center gap-4 px-5 py-4">
          <div className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${theme.iconBg}`}>
            <ManeuverIcon
              maneuverType={notice.maneuverType}
              modifier={notice.modifier}
              className={`w-8 h-8 ${theme.iconColor}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-base font-bold ${theme.title} leading-tight truncate`}>
              {notice.instruction}
            </p>
            <p className={`text-xs ${theme.body} mt-0.5 truncate`}>
              in {notice.distanceLabel}
              {notice.streetName ? ` · ${notice.streetName}` : ''}
            </p>
          </div>
        </div>
      )
  }
}

// ─── Reroute-Card mit Countdown-Bar + Auto-Accept ────────────────────

function RerouteCard({
  notice,
  theme,
}: {
  notice: Extract<NaviNotice, { type: 'reroute' }>
  theme: Theme
}) {
  const [remaining, setRemaining] = useState(REROUTE_AUTO_ACCEPT_MS)
  const acceptedRef = useRef(false)

  useEffect(() => {
    acceptedRef.current = false
    setRemaining(REROUTE_AUTO_ACCEPT_MS)
    const startedAt = Date.now()
    const id = window.setInterval(() => {
      if (acceptedRef.current) return
      const elapsed = Date.now() - startedAt
      const left = Math.max(0, REROUTE_AUTO_ACCEPT_MS - elapsed)
      setRemaining(left)
      if (left <= 0 && !acceptedRef.current) {
        acceptedRef.current = true
        window.clearInterval(id)
        notice.onAccept()
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [notice])

  const progressPct = (remaining / REROUTE_AUTO_ACCEPT_MS) * 100
  const isHazard = notice.reason === 'hazard'
  const remainingSec = Math.ceil(remaining / 1000)

  const handleAccept = () => {
    if (acceptedRef.current) return
    acceptedRef.current = true
    notice.onAccept()
  }
  const handleDismiss = () => {
    if (acceptedRef.current) return
    acceptedRef.current = true
    notice.onDismiss()
  }

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${theme.iconBg}`}>
          {isHazard ? (
            <AlertTriangleIcon className={`w-6 h-6 ${theme.iconColor}`} />
          ) : (
            <RouteIcon className={`w-6 h-6 ${theme.iconColor}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-base font-bold ${theme.title} leading-tight`}>
            {isHazard ? 'Hindernis voraus' : `Schnellere Route — ${Math.round(notice.etaSavedSec / 60)} min sparen`}
          </p>
          <p className={`text-xs ${theme.body} mt-0.5`}>
            {isHazard ? (notice.hazardLabel ?? 'Auf der aktuellen Strecke') : 'Wechseln auf die staufreie Alternative?'}
          </p>
        </div>
        {/* 2026-05-08 (Aaron-Brief): Countdown-Sekunden als sekundärer
            Indikator. Wer schnell schaut sieht hier "in 7 s wird gewechselt"
            ohne die ProgressBar abzuziehen. */}
        <span className={`shrink-0 text-xs font-semibold ${theme.body} tabular-nums`}>
          in {remainingSec} s
        </span>
      </div>
      <div className="flex items-center gap-2 px-5 pb-4">
        <button
          type="button"
          onClick={handleAccept}
          className="flex-1 h-11 rounded-xl bg-white text-claimondo-navy text-sm font-semibold hover:bg-white/90 transition-colors"
        >
          Wechseln
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-1 h-11 rounded-xl bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors"
        >
          Bleiben
        </button>
      </div>
      {/* Progress-Bar — leert sich von 100 % nach 0 % über 10 s. Bei 0
          wird onAccept ausgelöst. */}
      <div className="h-1 bg-white/10">
        <div
          className="h-full bg-white transition-[width] ease-linear"
          style={{ width: `${progressPct}%`, transitionDuration: '100ms' }}
        />
      </div>
    </div>
  )
}

// ─── Helpers für Caller ──────────────────────────────────────────────

/**
 * Resolved den höchst-priorisierten Notice aus mehreren Trigger-Quellen.
 * Caller-side aufrufen damit die Render-Logic im NaviHud minimal bleibt.
 */
export function pickHighestPriorityNotice(notices: {
  blitzer?: NaviNotice | null
  hazard?: NaviNotice | null
  reroute?: NaviNotice | null
  lane?: NaviNotice | null
  maneuver?: NaviNotice | null
}): NaviNotice | null {
  return (
    notices.blitzer ??
    notices.hazard ??
    notices.reroute ??
    notices.lane ??
    notices.maneuver ??
    null
  )
}

/**
 * Distance-Formatter für Notice-Labels. Kompatibel zu den Distanzformaten
 * im Rest des Feldmodus (FeldmodusMap, AktuellerStopCard).
 */
export function formatNaviDistance(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}
