'use client'

// AAR-769 Phase 2: Web-Implementierung von <Badge>.
// Inline-Flex-Pill, Token-basierte Farben, Glass-Variante mit Backdrop-Blur.

import { tokens } from '@/lib/design-tokens'
import type { BadgeProps, BadgeSize, BadgeTone } from './Badge.types'

type ToneStyle = { bg: string; text: string }

const solidToneMap: Record<BadgeTone, ToneStyle> = {
  neutral: { bg: tokens.cssColors.bg, text: tokens.cssColors.navy },
  info: {
    bg: 'color-mix(in srgb, var(--brand-secondary, #4573A2) 12%, transparent)',
    text: tokens.cssColors.ondo,
  },
  success: { bg: 'rgba(16, 185, 129, 0.14)', text: tokens.colors.successText },
  warning: { bg: 'rgba(245, 158, 11, 0.16)', text: tokens.colors.warningText },
  danger: { bg: 'rgba(244, 63, 94, 0.14)', text: tokens.colors.dangerText },
  navy: { bg: tokens.cssColors.navy, text: tokens.colors.white },
  ondo: { bg: tokens.cssColors.ondo, text: tokens.colors.white },
}

// Glass-Variante: Token-Farbe mit Alpha + Blur.
const glassToneMap: Record<BadgeTone, ToneStyle> = {
  neutral: {
    bg: 'color-mix(in srgb, var(--brand-background, #f8f9fb) 80%, transparent)',
    text: tokens.cssColors.navy,
  },
  info: {
    bg: 'color-mix(in srgb, var(--brand-secondary, #4573A2) 80%, transparent)',
    text: tokens.colors.white,
  },
  success: { bg: 'rgba(16, 185, 129, 0.8)', text: tokens.colors.white },
  warning: { bg: 'rgba(245, 158, 11, 0.8)', text: tokens.colors.white },
  danger: { bg: 'rgba(244, 63, 94, 0.8)', text: tokens.colors.white },
  navy: {
    bg: 'color-mix(in srgb, var(--brand-primary, #0D1B3E) 80%, transparent)',
    text: tokens.colors.white,
  },
  ondo: {
    bg: 'color-mix(in srgb, var(--brand-secondary, #4573A2) 80%, transparent)',
    text: tokens.colors.white,
  },
}

const heightMap: Record<BadgeSize, number> = { sm: 18, md: 22 }
const fontMap: Record<BadgeSize, number> = { sm: 10, md: 11 }

export function Badge({
  children,
  tone = 'neutral',
  glass = false,
  size = 'md',
}: BadgeProps) {
  const t = glass ? glassToneMap[tone] : solidToneMap[tone]

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: 6,
    height: heightMap[size],
    borderRadius: tokens.radius.full,
    backgroundColor: t.bg,
    color: t.text,
    fontSize: fontMap[size],
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  }

  if (glass) {
    style.backdropFilter = 'blur(10px)'
    ;(style as React.CSSProperties & {
      WebkitBackdropFilter?: string
    }).WebkitBackdropFilter = 'blur(10px)'
  }

  return <span style={style}>{children}</span>
}
