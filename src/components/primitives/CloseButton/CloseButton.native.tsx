// @ts-expect-error RN optional
import { Pressable, View } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { CloseButtonProps } from './CloseButton.types'

export function CloseButton({ onPress, label = 'Schließen', offset = 16 }: CloseButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }: { pressed: boolean }) => ({
        position: 'absolute',
        top: offset,
        right: offset,
        width: 40,
        height: 40,
        borderRadius: tokens.radius.full,
        backgroundColor: pressed ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.72)',
        borderWidth: 1,
        borderColor: tokens.glass.light.border,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        zIndex: 50,
        ...tokens.shadowNative.md,
      })}
    >
      {/* TODO: AAR-769 Follow-up — Expo-Icon-Mapping */}
      <View style={{ position: 'relative', width: 14, height: 14 }}>
        <View
          style={{
            position: 'absolute',
            top: 6,
            left: 0,
            width: 14,
            height: 2,
            backgroundColor: tokens.colors.navy,
            transform: [{ rotate: '45deg' }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 6,
            left: 0,
            width: 14,
            height: 2,
            backgroundColor: tokens.colors.navy,
            transform: [{ rotate: '-45deg' }],
          }}
        />
      </View>
    </Pressable>
  )
}
