// @ts-expect-error RN optional
import { View, Text } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { DropletBadgeProps } from './DropletBadge.types'

export function DropletBadge({ count, tone = 'danger', size = 18 }: DropletBadgeProps) {
  if (count <= 0) return null
  const label = count > 99 ? '99+' : String(count)

  return (
    <View
      style={{
        minWidth: size,
        height: size,
        paddingHorizontal: count >= 10 ? 4 : 0,
        borderRadius: tokens.radius.full,
        backgroundColor: tokens.colors[tone],
        alignItems: 'center',
        justifyContent: 'center',
        ...tokens.shadowNative.sm,
      }}
    >
      <Text
        style={{
          color: tokens.colors.white,
          fontSize: size <= 18 ? 10 : 11,
          fontWeight: '700',
          lineHeight: size,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
