'use client'

// AAR-769 Phase 2: Web-Implementierung von <Badge>.
// Inline-Flex-Pill, Token-basierte Farben, Glass-Variante mit Backdrop-Blur.

import { tokens } from '@/lib/design-tokens'
import type { BadgeProps, BadgeSize, BadgeTone } from './Badge.types'

// Darker Text-Farben für semantische Tones (Lesbarkeit auf hellem Tint).
const SUCCESS_TEXT = '#047857' // emerald-700
const WARNING_TEXT = '#92400e' // amber-800
const DANGER_TEXT = '#9f1239' // rose-800

type ToneStyle = { bg: string; text: string }

const solidToneMap: Record<BadgeTone, ToneStyle> = {
  neutral: { bg: tokens.colors.bg, text: tokens.colors.navy },
  info: { bg: 'rgba(69, 115, 162, 0.12)', text: tokens.colors.ondo },
  success: { bg: 'rgba(16, 185, 129, 0.14)', text: SUCCESS_TEXT },
  warning: { bg: 'rgba(245, 158, 11, 0.16)', text: WARNING_TEXT },
  danger: { bg: 'rgba(244, 63, 94, 0.14)', text: DANGER_TEXT },
  navy: { bg: tokens.colors.navy, text: tokens.colors.white },
  ondo: { bg: tokens.colors.ondo, text: tokens.colors.white },
}

// Glass-Variante: Token-Farbe mit Alpha + Blur.
const glassToneMap: Record<BadgeTone, ToneStyle> = {
  neutral: { bg: 'rgba(248, 249, 251, 0.8)', text: tokens.colors.navy },
  info: { bg: 'rgba(69, 115, 162, 0.8)', text: tokens.colors.white },
  success: { bg: 'rgba(16, 185, 129, 0.8)', text: tokens.colors.white },
  warning: { bg: 'rgba(245, 158, 11, 0.8)', text: tokens.colors.white },
  danger: { bg: 'rgba(244, 63, 94, 0.8)', text: tokens.colors.white },
  navy: { bg: 'rgba(13, 27, 62, 0.8)', text: tokens.colors.white },
  ondo: { bg: 'rgba(69, 115, 162, 0.8)', text: tokens.colors.white },
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
