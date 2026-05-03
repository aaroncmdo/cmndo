// @ts-expect-error RN optional
import { Modal as RNModal, Pressable, View, StyleSheet } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import { CloseButton } from '../CloseButton/CloseButton.native'
import type { DrawerProps } from './Drawer.types'

export function Drawer({
  open,
  onClose,
  children,
  side = 'right',
  width = 360,
  closeOnBackdrop = true,
  hideCloseButton = false,
  ariaLabel,
}: DrawerProps) {
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
          flexDirection: 'row' as const,
          justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
          backgroundColor: 'rgba(13, 27, 62, 0.28)',
        }}
      >
        <Pressable
          onPress={closeOnBackdrop ? onClose : undefined}
          style={StyleSheet.absoluteFill as object}
        />
        <View
          style={{
            width,
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: tokens.spacing[6],
            ...tokens.shadowNative.lg,
          }}
        >
          {!hideCloseButton && <CloseButton onPress={onClose} offset={12} />}
          {children}
        </View>
      </View>
    </RNModal>
  )
}
