// AAR-727 (fallphasen-glass): Shared Glass-Panel um die PhasePipeline.
//
// Konsolidiert die drei bisher pro Portal duplizierten Wrapper:
//   - Admin FallakteShell → `<aside>` mit "Phasen"-Überschrift + vertical Pipeline
//   - Kunde Fallakte → Card mit "Mein Fortschritt" + Progress-Bar + vertical Pipeline
//   - Gutachter FallHeader → horizontale Pipeline-Leiste + Terminal-Badge für storniert
//
// CMM-44 MP-4b: Liest jetzt den `ClaimLifecycle` (getClaimLifecycle, 4 Haupt-
// phasen) statt der 10-Phasen/52-Subphasen-Matrix. Intern via
// `buildClaimPhasePipeline()`. Terminal-`storniert` + Progress werden aus dem
// Lifecycle abgeleitet; Side-Quests (Nachbesichtigung/Stellungnahme) rendern
// parallel unter der Pipeline. Surface: glass-light + rounded-ios-lg +
// shadow-ios-sm.

import type { ReactNode } from 'react'
import { buildClaimPhasePipeline } from '@/lib/fall/subphase-visibility'
import { SUBPHASE_LABEL, type ClaimLifecycle } from '@/lib/claims/lifecycle'
import { PhasePipeline } from './PhasePipeline'
import type { Rolle } from './types'

export type FallPhasenPanelVariant = 'aside' | 'progress-card' | 'header-strip'

export interface FallPhasenPanelProps {
  /** CMM-44 MP-4b: 4-Phasen-Lifecycle aus getClaimLifecycle / v_claim_phase. */
  lifecycle: ClaimLifecycle
  rolle: Rolle
  variant: FallPhasenPanelVariant
  /** Optional: Claim/Fall-ID nur für das `data-fall`-Debug-Attribut der Pipeline. */
  fallId?: string
  /**
   * `progress-card`: Optionaler Banner unterhalb der Pipeline (z. B. Rügefall-
   * Hinweis beim Kunden). Wird im Glass-Panel mit gleichem Padding integriert.
   */
  banner?: ReactNode
  /**
   * Overrides das Variant-Default für PhaseStep-Timestamps.
   * Default: `aside` = true, `progress-card` / `header-strip` = false.
   */
  showTimestamps?: boolean
  className?: string
}

const TERMINAL_PILL =
  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-claimondo-bg text-claimondo-ondo text-xs font-medium w-fit'

/** Side-Quests (Nachbesichtigung/Stellungnahme) parallel zur Hauptphase —
 *  analog ClaimStepper (CMM-32f). Nur sichtbar wenn welche aktiv sind. */
function SideQuests({ lifecycle }: { lifecycle: ClaimLifecycle }) {
  if (lifecycle.aktiveSideQuests.length === 0) return null
  return (
    <div className="border-t border-claimondo-border pt-3 mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1.5">
        Zusätzlich aktiv
      </p>
      <div className="flex flex-wrap gap-2">
        {lifecycle.aktiveSideQuests.map((auftrag) => (
          <span
            key={auftrag.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 px-3 py-1 text-xs font-medium text-claimondo-navy"
          >
            {auftrag.typ === 'nachbesichtigung' ? 'Nachbesichtigung' : 'Stellungnahme'}
            <span className="text-claimondo-navy">
              {' · '}
              {SUBPHASE_LABEL[
                auftrag.status === 'termin'
                  ? 'termin'
                  : auftrag.status === 'besichtigung'
                    ? 'besichtigung'
                    : 'gutachten'
              ]}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function FallPhasenPanel({
  lifecycle,
  rolle,
  variant,
  fallId,
  banner,
  showTimestamps,
  className = '',
}: FallPhasenPanelProps) {
  const pipelinePhases = buildClaimPhasePipeline(lifecycle, rolle)
  const pipelineFall = { id: fallId ?? '', aktuelle_phase: null }
  // CMM-44 MP-4b: Terminal-`storniert` aus dem Lifecycle abgeleitet (B-11).
  const istStorniert =
    lifecycle.mainPhase === 'abschluss' && lifecycle.subPhase === 'storniert'

  if (variant === 'header-strip') {
    return (
      <div className={`glass-light rounded-ios-lg shadow-ios-sm px-4 py-3 ${className}`}>
        {istStorniert ? (
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
        <SideQuests lifecycle={lifecycle} />
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
      <SideQuests lifecycle={lifecycle} />
    </section>
  )
}
