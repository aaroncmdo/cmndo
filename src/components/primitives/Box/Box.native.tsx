// AAR-769 Phase 2: Native-Implementierung von <Box>.
// Wird von Metro automatisch gewählt wenn die Expo/RN-App kommt.
// Next.js ignoriert .native.tsx Files.
//
// eslint-disable-next-line — RN-Imports sind absichtlich nicht im Web-Build
// @ts-expect-error RN is optional peer dep for now

import { View } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { BoxProps } from './Box.types'

const roleMap: Record<
  NonNullable<BoxProps['role']>,
  'none' | 'header' | 'none' | 'main' | 'none'
> = {
  region: 'none',
  banner: 'header',
  complementary: 'none',
  main: 'main',
  navigation: 'none',
  none: 'none',
}

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
}: BoxProps) {
  const style = {
    padding: p !== undefined ? tokens.spacing[p] : undefined,
    paddingHorizontal: px !== undefined ? tokens.spacing[px] : undefined,
    paddingVertical: py !== undefined ? tokens.spacing[py] : undefined,
    margin: m !== undefined ? tokens.spacing[m] : undefined,
    marginHorizontal: mx !== undefined ? tokens.spacing[mx] : undefined,
    marginVertical: my !== undefined ? tokens.spacing[my] : undefined,
    backgroundColor: bg ? tokens.colors[bg] : undefined,
    borderWidth: bordered ? 1 : undefined,
    borderColor: bordered ? tokens.colors.border : undefined,
    borderRadius: radius ? tokens.radius[radius] : undefined,
    maxWidth,
    ...(shadow ? tokens.shadowNative[shadow] : {}),
  }

  return (
    <View style={style} accessibilityRole={role ? roleMap[role] : 'none'}>
      {children}
    </View>
  )
}
