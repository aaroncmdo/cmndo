// @ts-expect-error RN optional
import { Pressable, View } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { BackButtonProps } from './BackButton.types'

// Native: Icon-Placeholder bis @expo/vector-icons integriert ist
export function BackButton({ onPress, label = 'Zurück', offset = 16 }: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }: { pressed: boolean }) => ({
        position: 'absolute',
        top: offset,
        left: offset,
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
      <View
        style={{
          width: 10,
          height: 10,
          borderLeftWidth: 2,
          borderTopWidth: 2,
          borderColor: tokens.colors.navy,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </Pressable>
  )
}
