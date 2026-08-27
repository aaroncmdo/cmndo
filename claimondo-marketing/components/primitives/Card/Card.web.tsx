'use client'

// AAR-769 Phase 2: Web-Implementierung von <Card>.
// Solid weiß als Default; glass='light' = backdrop-blur Schwebe-Card;
// glass='dark' = opake Navy-Card. accentColor faerbt den GANZEN Rahmen und
// legt einen 6-%-Tint derselben Farbe unter die Card (siehe unten).

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
  className,
}: CardProps) {
  const [hover, setHover] = useState(false)

  const isGlass = glass !== undefined
  const showBorder = bordered ?? !isGlass

  const radiusValue = tokens.radius[radius]
  const accent = accentColor ? tokens.cssColors[accentColor] : undefined

  const baseStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    padding: tokens.spacing[p],
    borderRadius: radiusValue,
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
    // glass.dark.bg ist '#0D1B3E' (Brand-Navy) — als var(--brand-*) damit das
    // Whitelabel-Theme verifizierter SVs greift. Fallback = identischer Hex.
    baseStyle.backgroundColor = 'var(--brand-primary, #0D1B3E)'
    if (showBorder) {
      baseStyle.border = `1px solid ${tokens.glass.dark.border}`
    }
  } else {
    baseStyle.backgroundColor = tokens.colors.white
    if (showBorder) {
      baseStyle.border = `1px solid ${tokens.cssColors.border}`
    }
  }

  // Akzent = ganzer Rahmen + leiser Flaechen-Tint, NICHT ein 4px-Streifen links.
  // Ein farbiger `border-left: 4px` auf einer Card ist ein Side-Stripe — eines der
  // verbotenen Muster der Design-Gesetze; die dort genannte Alternative ist genau
  // "full border + background tint". Praktisch ist sie hier auch die bessere:
  // der einzige Consumer (gutachter-partner, Bestaetigungs-Card) hat zentrierten
  // Inhalt, an dem eine linke Kante nichts ausrichtet, und der Radius bleibt jetzt
  // rundum gleich (vorher war links auf 0 gekantet, damit der Streifen buendig sass).
  if (accent) {
    baseStyle.border = `1px solid ${accent}`
    baseStyle.backgroundColor = `color-mix(in srgb, ${accent} 6%, ${baseStyle.backgroundColor})`
  }

  if (onPress) {
    return (
      <button
        type="button"
        style={baseStyle}
        className={className}
        onClick={onPress}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {children}
      </button>
    )
  }

  return <div style={baseStyle} className={className}>{children}</div>
}
