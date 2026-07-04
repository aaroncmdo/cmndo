'use client'

import { tokens } from '@/lib/design-tokens'
import type { LiveOpsData } from './types'

// ------------------------------------------------------------------ Props

export interface StatBarProps {
  data: LiveOpsData
}

// ------------------------------------------------------------------ Stat-Item

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        paddingLeft: tokens.spacing[3],
        paddingRight: tokens.spacing[3],
      }}
    >
      <span
        style={{
          fontSize: tokens.typo.headingSm.size,
          fontWeight: 700,
          lineHeight: 1,
          color: tokens.cssColors.navy,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: tokens.typo.caption.size,
          fontWeight: 500,
          color: tokens.cssColors.lightBlue,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ Component

export default function StatBar({ data }: StatBarProps) {
  const live = data.svs.filter((sv) => sv.car.mode === 'live').length
  const unterwegs = data.svs.filter((sv) => sv.car.mode !== 'none').length
  const offeneTermine = data.termine.length
  const deadPins = data.deadPins.length
  const leads = data.leads.length

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'rgba(248,249,251,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: tokens.radius.lg,
        boxShadow: tokens.shadow.md,
        border: `1px solid ${tokens.cssColors.border}`,
        padding: `${tokens.spacing[2]}px ${tokens.spacing[1]}px`,
        gap: 0,
        pointerEvents: 'none',
      }}
      aria-label="Live-Ops-Statistiken"
    >
      <StatItem label="Live" value={live} />

      <div
        style={{
          width: 1,
          height: 28,
          backgroundColor: tokens.cssColors.border,
          flexShrink: 0,
        }}
      />

      <StatItem label="Unterwegs" value={unterwegs} />

      <div
        style={{
          width: 1,
          height: 28,
          backgroundColor: tokens.cssColors.border,
          flexShrink: 0,
        }}
      />

      <StatItem label="Offene Termine" value={offeneTermine} />

      <div
        style={{
          width: 1,
          height: 28,
          backgroundColor: tokens.cssColors.border,
          flexShrink: 0,
        }}
      />

      <StatItem label="Dead-Pins" value={deadPins} />

      <div
        style={{
          width: 1,
          height: 28,
          backgroundColor: tokens.cssColors.border,
          flexShrink: 0,
        }}
      />

      <StatItem label="Leads" value={leads} />
    </div>
  )
}
