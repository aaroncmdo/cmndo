'use client'

// AAR-769 Phase 2: Web-Implementierung von <Card>.
// Solid weiß als Default; glass='light' = backdrop-blur Schwebe-Card;
// glass='dark' = opake Navy-Card. accentColor erzeugt 4px Border-Left
// und kantet die linke Seite (rechts gerundet).

import { useState } from 'react'
import { tokens } from '@/lib/design-tokens'
import type { CardProps } from './Card.types'

export function Card({
  children,
  glass,
  accentColor,
  p = 4,
  radius = 'md',
  shadow = 'sm',
  bordered,
  onPress,
}: CardProps) {
  const [hover, setHover] = useState(false)

  const isGlass = glass !== undefined
  const showBorder = bordered ?? !isGlass

  const radiusValue = tokens.radius[radius]
  const accent = accentColor ? tokens.colors[accentColor] : undefined

  const baseStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    padding: tokens.spacing[p],
    borderRadius: accent ? `0 ${radiusValue}px ${radiusValue}px 0` : radiusValue,
    boxShadow: tokens.shadow[shadow],
    textAlign: 'left',
    width: '100%',
    cursor: onPress ? 'pointer' : undefined,
    transition: 'transform 120ms ease, box-shadow 120ms ease',
    transform: onPress && hover ? 'translateY(-1px)' : undefined,
  }

  if (isGlass && glass === 'light') {
    baseStyle.backgroundColor = tokens.glass.light.bg
    baseStyle.backdropFilter = `blur(${tokens.glass.light.blur}px)`
    // Vendor-prefix via cast — React-Typings kennen WebkitBackdropFilter.
    ;(baseStyle as React.CSSProperties & {
      WebkitBackdropFilter?: string
    }).WebkitBackdropFilter = `blur(${tokens.glass.light.blur}px)`
    if (showBorder) {
      baseStyle.border = `1px solid ${tokens.glass.light.border}`
    }
  } else if (isGlass && glass === 'dark') {
    baseStyle.backgroundColor = tokens.glass.dark.bg
    if (showBorder) {
      baseStyle.border = `1px solid ${tokens.glass.dark.border}`
    }
  } else {
    baseStyle.backgroundColor = tokens.colors.white
    if (showBorder) {
      baseStyle.border = `1px solid ${tokens.colors.border}`
    }
  }

  if (accent) {
    baseStyle.borderLeft = `4px solid ${accent}`
  }

  if (onPress) {
    return (
      <button
        type="button"
        style={baseStyle}
        onClick={onPress}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {children}
      </button>
    )
  }

  return <div style={baseStyle}>{children}</div>
}
