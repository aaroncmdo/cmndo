// AAR-727 (fallphasen-glass): Shared Glass-Panel um die PhasePipeline.
//
// Konsolidiert die drei bisher pro Portal duplizierten Wrapper:
//   - Admin FallakteShell → `<aside>` mit "Phasen"-Überschrift + vertical Pipeline
//   - Kunde Fallakte → Card mit "Mein Fortschritt" + Progress-Bar + vertical Pipeline
//   - Gutachter FallHeader → horizontale Pipeline-Leiste + Terminal-Badge für storniert
//
// Internalisiert `buildPhasePipelineData()` + berechnet Progress für die Kunde-
// Variante. Surface: glass-light + rounded-ios-lg + shadow-ios-sm (Pattern aus
// PR #250 Dialog/Sheet + #251 DropdownMenu).

import type { ReactNode } from 'react'
import type { FallForPipeline } from '@/lib/fall/subphase-visibility'
import { buildPhasePipelineData } from '@/lib/fall/subphase-visibility'
import { PhasePipeline } from './PhasePipeline'
import type { Rolle } from './types'

export type FallPhasenPanelVariant = 'aside' | 'progress-card' | 'header-strip'

export interface FallPhasenPanelProps {
  fall: FallForPipeline
  rolle: Rolle
  variant: FallPhasenPanelVariant
  /**
   * `progress-card`: Optionaler Banner unterhalb der Pipeline (z. B. Rügefall-
   * Hinweis beim Kunden). Wird im Glass-Panel mit gleichem Padding integriert.
   */
  banner?: ReactNode
  /**
   * `header-strip`: Wenn `storniert`, ersetzt die Pipeline durch einen Badge.
   * `abgeschlossen` bleibt wie bisher: Pipeline wird weiterhin gerendert (alle
   * Phasen done). Wert `null`/undefined → normale Pipeline-Darstellung.
   */
  terminal?: 'storniert' | null
  /**
   * Overrides das Variant-Default für PhaseStep-Timestamps.
   * Default: `aside` = true, `progress-card` / `header-strip` = false.
   */
  showTimestamps?: boolean
  className?: string
}

const TERMINAL_PILL =
  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-claimondo-bg text-claimondo-ondo text-xs font-medium w-fit'

export function FallPhasenPanel({
  fall,
  rolle,
  variant,
  banner,
  terminal = null,
  showTimestamps,
  className = '',
}: FallPhasenPanelProps) {
  const pipelinePhases = buildPhasePipelineData(fall, rolle)
  const pipelineFall = { id: fall.id, aktuelle_phase: fall.aktuelle_phase }

  if (variant === 'header-strip') {
    return (
      <div className={`glass-light rounded-ios-lg shadow-ios-sm px-4 py-3 ${className}`}>
        {terminal === 'storniert' ? (
          <span className={TERMINAL_PILL}>Fall storniert</span>
        ) : (
          <PhasePipeline
            fall={pipelineFall}
            rolle={rolle}
            phases={pipelinePhases}
            variant="horizontal"
            showTimestamps={showTimestamps ?? false}
          />
        )}
      </div>
    )
  }

  if (variant === 'progress-card') {
    const sichtbar = pipelinePhases.filter((p) => p.state !== 'hidden')
    const done = sichtbar.filter((p) => p.state === 'done').length
    const progressPct = sichtbar.length
      ? Math.round((done / sichtbar.length) * 100)
      : 0

    return (
      <section className={`glass-light rounded-ios-lg shadow-ios-sm p-5 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-base font-semibold text-claimondo-navy">Mein Fortschritt</p>
          <span className="text-base font-bold text-claimondo-ondo">{progressPct}%</span>
        </div>
        <div className="w-full h-2.5 bg-claimondo-bg/70 rounded-full mb-5">
          <div
            className="h-full bg-claimondo-ondo rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <PhasePipeline
          fall={pipelineFall}
          rolle={rolle}
          phases={pipelinePhases}
          variant="vertical"
          showTimestamps={showTimestamps ?? false}
        />
        {banner}
      </section>
    )
  }

  // variant === 'aside'
  return (
    <section className={`glass-light rounded-ios-lg shadow-ios-sm p-4 ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo/70 mb-3">
        Phasen
      </h3>
      <PhasePipeline
        fall={pipelineFall}
        rolle={rolle}
        phases={pipelinePhases}
        variant="vertical"
        showTimestamps={showTimestamps ?? true}
      />
    </section>
  )
}
