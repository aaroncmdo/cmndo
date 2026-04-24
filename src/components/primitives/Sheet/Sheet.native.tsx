// @ts-expect-error RN optional
import { Modal as RNModal, Pressable, View, StyleSheet } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { SheetProps } from './Sheet.types'

export function Sheet({
  open,
  onClose,
  children,
  maxHeightRatio = 0.85,
  closeOnBackdrop = true,
  ariaLabel,
}: SheetProps) {
  return (
    <RNModal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityLabel={ariaLabel}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(13, 27, 62, 0.28)',
        }}
      >
        <Pressable
          onPress={closeOnBackdrop ? onClose : undefined}
          style={StyleSheet.absoluteFill as object}
        />
        <View
          style={{
            maxHeight: `${maxHeightRatio * 100}%` as unknown as number,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderTopLeftRadius: tokens.radius.lg,
            borderTopRightRadius: tokens.radius.lg,
            padding: tokens.spacing[6],
            paddingTop: tokens.spacing[4],
            ...tokens.shadowNative.lg,
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              backgroundColor: tokens.colors.border,
              borderRadius: tokens.radius.full,
              alignSelf: 'center' as const,
              marginBottom: tokens.spacing[4],
            }}
          />
          {children}
        </View>
      </View>
    </RNModal>
  )
}
