'use client'

// AAR-769 Phase 2: Web-Implementierung von <Box>.
// Nutzt Inline-Style für Tokens (nicht Tailwind), damit die gleichen
// numerischen Werte wie in .native.tsx laufen. AAR-frontend-konsolidierung-p2
// (P2-T0): optionaler `className`-Escape-Hatch — additiv, die token-abgeleiteten
// inline-styles gewinnen bei Konflikten.

import { tokens } from '@/lib/design-tokens'
import type { BoxProps } from './Box.types'

export function Box({
  children,
  p,
  px,
  py,
  m,
  mx,
  my,
  bg,
  bordered,
  radius,
  shadow,
  maxWidth,
  role,
  className,
}: BoxProps) {
  const style: React.CSSProperties = {
    boxSizing: 'border-box',
    padding: p !== undefined ? tokens.spacing[p] : undefined,
    paddingLeft: px !== undefined ? tokens.spacing[px] : undefined,
    paddingRight: px !== undefined ? tokens.spacing[px] : undefined,
    paddingTop: py !== undefined ? tokens.spacing[py] : undefined,
    paddingBottom: py !== undefined ? tokens.spacing[py] : undefined,
    margin: m !== undefined ? tokens.spacing[m] : undefined,
    marginLeft: mx !== undefined ? tokens.spacing[mx] : undefined,
    marginRight: mx !== undefined ? tokens.spacing[mx] : undefined,
    marginTop: my !== undefined ? tokens.spacing[my] : undefined,
    marginBottom: my !== undefined ? tokens.spacing[my] : undefined,
    backgroundColor: bg ? tokens.colors[bg] : undefined,
    border: bordered ? `1px solid ${tokens.colors.border}` : undefined,
    borderRadius: radius ? tokens.radius[radius] : undefined,
    boxShadow: shadow ? tokens.shadow[shadow] : undefined,
    maxWidth,
  }

  return (
    <div style={style} className={className} role={role === 'none' ? undefined : role}>
      {children}
    </div>
  )
}
