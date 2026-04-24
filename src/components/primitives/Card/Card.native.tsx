// AAR-769 Phase 2: Native-Implementierung von <Card>.
// Glass-Light nutzt rgba-Fallback — echtes Backdrop-Blur kommt mit
// @react-native-community/blur, sobald die Expo-App live ist.

// @ts-expect-error RN ist optional peer dep
import { View, Pressable } from 'react-native'
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
  const isGlass = glass !== undefined
  const showBorder = bordered ?? !isGlass
  const radiusValue = tokens.radius[radius]
  const accent = accentColor ? tokens.colors[accentColor] : undefined

  let backgroundColor: string = tokens.colors.white
  let borderColor: string = tokens.colors.border
  if (isGlass && glass === 'light') {
    backgroundColor = tokens.glass.light.bg
    borderColor = tokens.glass.light.border
  } else if (isGlass && glass === 'dark') {
    backgroundColor = tokens.glass.dark.bg
    borderColor = tokens.glass.dark.border
  }

  const style = {
    padding: tokens.spacing[p],
    backgroundColor,
    borderTopLeftRadius: accent ? 0 : radiusValue,
    borderBottomLeftRadius: accent ? 0 : radiusValue,
    borderTopRightRadius: radiusValue,
    borderBottomRightRadius: radiusValue,
    borderWidth: showBorder ? 1 : 0,
    borderColor: showBorder ? borderColor : undefined,
    borderLeftWidth: accent ? 4 : showBorder ? 1 : 0,
    borderLeftColor: accent ?? (showBorder ? borderColor : undefined),
    ...tokens.shadowNative[shadow],
  }

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }: { pressed: boolean }) => [
          style,
          { opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={onPress}
      >
        {children}
      </Pressable>
    )
  }

  return <View style={style}>{children}</View>
}
