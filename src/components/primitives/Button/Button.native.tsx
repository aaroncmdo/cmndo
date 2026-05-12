// AAR-769 Phase 2: Native-Implementierung von <Button>.
// Pressed-Feedback via Pressable opacity. Tone-Map identisch zu Web,
// Hover-Werte werden auf Native nicht gerendert (kein Hover-Konzept).

// @ts-expect-error RN ist optional peer dep
import { Pressable, Text, View } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { ButtonProps, ButtonSize, ButtonTone } from './Button.types'

const heightMap: Record<ButtonSize, number> = {
  sm: 36,
  md: tokens.touchMin,
  lg: 52,
  icon: tokens.touchMin, // 44 — quadratisch
}

const fontSizeMap: Record<ButtonSize, number> = {
  sm: 13,
  md: 14,
  lg: 16,
  icon: 14,
}

type ToneStyle = { bg: string; text: string; border?: string }

const toneMap: Record<ButtonTone, ToneStyle> = {
  navy: { bg: tokens.colors.navy, text: tokens.colors.white },
  ondo: { bg: tokens.colors.ondo, text: tokens.colors.white },
  ghost: {
    bg: 'transparent',
    text: tokens.colors.navy,
    border: tokens.colors.border,
  },
  danger: { bg: tokens.colors.danger, text: tokens.colors.white },
  success: { bg: tokens.colors.success, text: tokens.colors.white },
}

export function Button({
  children,
  tone = 'navy',
  size = 'md',
  iconLeft,
  iconRight,
  fullWidth,
  disabled,
  onPress,
  ariaLabel,
}: ButtonProps) {
  const t = toneMap[tone]
  const isIcon = size === 'icon'

  const containerStyle = {
    height: heightMap[size],
    width: isIcon ? heightMap.icon : undefined,
    paddingHorizontal: isIcon ? 0 : tokens.spacing[4],
    borderRadius: tokens.radius.sm,
    backgroundColor: t.bg,
    borderWidth: t.border ? 1 : 0,
    borderColor: t.border,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: fullWidth ? ('stretch' as const) : ('flex-start' as const),
    opacity: disabled ? 0.5 : 1,
  }

  const textStyle = {
    color: t.text,
    fontSize: fontSizeMap[size],
    fontWeight: '600' as const,
    marginHorizontal: tokens.spacing[2],
  }

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={ariaLabel}
      style={({ pressed }: { pressed: boolean }) => [
        containerStyle,
        { opacity: pressed && !disabled ? 0.7 : containerStyle.opacity },
      ]}
    >
      {iconLeft ? <View>{iconLeft}</View> : null}
      {isIcon ? children : <Text style={textStyle}>{children}</Text>}
      {iconRight ? <View>{iconRight}</View> : null}
    </Pressable>
  )
}
