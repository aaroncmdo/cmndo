// AAR-565 (B2): Einzelne Phase-Card für PhasePipeline.
// Stellt eine von 10 Phasen dar — Orchestrator entscheidet Layout, dieses
// Component kümmert sich nur um den visuellen Status der einen Phase.

import { CheckIcon, CircleAlertIcon, MinusIcon } from 'lucide-react'
import type { PhaseStepData, PhaseVariant } from './types'
import { PhaseStatusDot } from './PhaseStatusDot'

const STATE_ICON_COLOR: Record<string, string> = {
  active: 'text-claimondo-ondo',
  done: 'text-emerald-500',
  blocked: 'text-rose-500',
  skipped: 'text-claimondo-light-blue',
  upcoming: 'text-claimondo-light-blue',
}

export function PhaseStep({
  data,
  variant,
  onClick,
  showTimestamps,
  isLast,
}: {
  data: PhaseStepData
  variant: PhaseVariant
  onClick?: (phase: number) => void
  showTimestamps?: boolean
  isLast?: boolean
}) {
  if (data.state === 'hidden') return null

  const interactive = !!onClick
  const Wrapper: 'button' | 'div' = interactive ? 'button' : 'div'

  const containerBase = 'flex items-start gap-3 rounded-lg transition-colors'
  const containerByVariant: Record<PhaseVariant, string> = {
    horizontal: 'flex-col items-center gap-2 px-3 py-2 text-center',
    vertical: 'px-3 py-2.5',
    compact: 'px-2 py-1.5 text-xs',
    timeline: 'px-3 py-2.5',
  }
  const stateBg: Record<string, string> = {
    active: 'bg-claimondo-ondo/10',
    done: 'bg-emerald-50',
    blocked: 'bg-rose-50',
    skipped: 'bg-claimondo-bg opacity-60',
    upcoming: 'bg-transparent',
  }
  const hoverCls = interactive ? 'hover:bg-claimondo-bg cursor-pointer' : ''

  const iconNode = (() => {
    if (data.state === 'done') return <CheckIcon className={`h-4 w-4 ${STATE_ICON_COLOR.done}`} />
    if (data.state === 'blocked') return <CircleAlertIcon className={`h-4 w-4 ${STATE_ICON_COLOR.blocked}`} />
    if (data.state === 'skipped') return <MinusIcon className={`h-4 w-4 ${STATE_ICON_COLOR.skipped}`} />
    return <PhaseStatusDot state={data.state} size="md" />
  })()

  const labelClass =
    data.state === 'active'
      ? 'font-semibold text-claimondo-navy'
      : data.state === 'done'
        ? 'text-claimondo-navy'
        : data.state === 'blocked'
          ? 'font-medium text-rose-700'
          : 'text-claimondo-ondo'

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={interactive ? () => onClick?.(data.phase) : undefined}
      className={`${containerBase} ${containerByVariant[variant]} ${stateBg[data.state] ?? ''} ${hoverCls} w-full text-left`}
      aria-current={data.state === 'active' ? 'step' : undefined}
    >
      <span className="flex items-center justify-center shrink-0 mt-0.5" aria-hidden>{iconNode}</span>
      <span className="flex-1 min-w-0">
        <span className={`flex items-baseline gap-2 ${variant === 'horizontal' ? 'justify-center' : ''}`}>
          <span className={`text-[11px] uppercase tracking-wider ${labelClass} opacity-70`}>
            {data.phase.toString().padStart(2, '0')}
          </span>
          <span className={`text-sm ${labelClass}`}>{data.name}</span>
        </span>
        {data.state === 'blocked' && data.blockReason && (
          <span className="block mt-0.5 text-[11px] text-rose-700">{data.blockReason}</span>
        )}
        {showTimestamps && data.reachedAt && (
          <span className="block mt-0.5 text-[11px] text-claimondo-ondo/70">
            {new Date(data.reachedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
      </span>
      {variant === 'vertical' && !isLast && (
        <span className="absolute left-[22px] top-10 bottom-0 w-px bg-claimondo-border" aria-hidden />
      )}
    </Wrapper>
  )
}
