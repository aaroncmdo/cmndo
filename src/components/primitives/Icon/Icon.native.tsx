// AAR-769 Phase 2: Native-Stub für <Icon>.
// AAR-769 Follow-up: Native-Icon-Mapping wenn Expo-App live ist
// (vermutlich via @expo/vector-icons oder lucide-react-native).
// Bis dahin rendern wir einen leeren View-Placeholder mit der Größe,
// damit Layouts nicht kollabieren.

// @ts-expect-error RN ist optional peer dep
import { View } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { IconProps } from './Icon.types'

export function Icon({ size = 16, color = 'navy' }: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: 'transparent',
        // Visuelle Marker damit klar ist: hier kommt später ein echtes Icon.
        borderWidth: 1,
        borderColor: tokens.colors[color],
        borderRadius: 2,
        opacity: 0.3,
      }}
    />
  )
}
