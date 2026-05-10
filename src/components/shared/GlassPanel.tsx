// 2026-05-07 Design-Review Item 1.4: Iconic „Heute-Sidebar"-Glass-Look als
// shared Component. Vorher: ~16 Stellen mit inline `bg-white/55 backdrop-blur-md
// border border-white/40 rounded-xl shadow-ios-md`. Drift-Risiko bei jeder
// Aenderung. Jetzt: <GlassPanel> mit drei Varianten + Doc-Comment.
//
// WICHTIG: GlassPanel ist fuer **schwebende Floating-Elemente** ueber Image/
// Map-Backgrounds. Auf normaler grey-bg-Page (`bg-claimondo-bg`) wirkt Glass
// schmutzig — dort weiterhin solid Card-Primitive nutzen.

import type { ReactNode } from 'react'

export type GlassPanelVariant = 'default' | 'subtle' | 'prominent'

type Props = {
  children: ReactNode
  /** default = Heute-Sidebar-Look (55%/blur-md). subtle = leichter (35%/blur-sm). prominent = blickdichter (75%/blur-xl). */
  variant?: GlassPanelVariant
  className?: string
  /** Optional padding override; default kein internal padding — Caller bestimmt. */
}

const VARIANT_CLS: Record<GlassPanelVariant, string> = {
  default: 'bg-white/55 backdrop-blur-md border border-white/40 shadow-ios-md',
  subtle: 'bg-white/35 backdrop-blur-sm border border-white/30 shadow-ios-sm',
  prominent: 'glass-card',
}

export default function GlassPanel({
  children,
  variant = 'default',
  className = '',
}: Props) {
  return (
    <div className={`${VARIANT_CLS[variant]} rounded-xl ${className}`}>
      {children}
    </div>
  )
}
