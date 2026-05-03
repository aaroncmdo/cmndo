// AAR-769 Phase 2: Native-Implementierung von <Badge>.
// RN erlaubt nur Text in Text — children werden in <Text> gewrapped.
// Backdrop-Blur fehlt in RN out-of-the-box (rgba-Fallback).

// @ts-expect-error RN ist optional peer dep
import { View, Text } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { BadgeProps, BadgeSize, BadgeTone } from './Badge.types'

type ToneStyle = { bg: string; text: string }

const solidToneMap: Record<BadgeTone, ToneStyle> = {
  neutral: { bg: tokens.colors.bg, text: tokens.colors.navy },
  info: { bg: 'rgba(69, 115, 162, 0.12)', text: tokens.colors.ondo },
  success: { bg: 'rgba(16, 185, 129, 0.14)', text: tokens.colors.successText },
  warning: { bg: 'rgba(245, 158, 11, 0.16)', text: tokens.colors.warningText },
  danger: { bg: 'rgba(244, 63, 94, 0.14)', text: tokens.colors.dangerText },
  navy: { bg: tokens.colors.navy, text: tokens.colors.white },
  ondo: { bg: tokens.colors.ondo, text: tokens.colors.white },
}

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

  const containerStyle = {
    paddingHorizontal: 6,
    height: heightMap[size],
    borderRadius: tokens.radius.full,
    backgroundColor: t.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
  }

  const textStyle = {
    color: t.text,
    fontSize: fontMap[size],
    fontWeight: '600' as const,
    lineHeight: heightMap[size],
  }

  return (
    <View style={containerStyle}>
      <Text style={textStyle}>{children}</Text>
    </View>
  )
}
