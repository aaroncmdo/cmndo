// @ts-expect-error RN optional
import { Modal as RNModal, Pressable, View } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import { CloseButton } from '../CloseButton/CloseButton.native'
import type { ModalProps } from './Modal.types'

export function Modal({
  open,
  onClose,
  children,
  maxWidth = 480,
  closeOnBackdrop = true,
  hideCloseButton = false,
  ariaLabel,
}: ModalProps) {
  return (
    <RNModal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityLabel={ariaLabel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(13, 27, 62, 0.28)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: tokens.spacing[4],
        }}
      >
        <Pressable
          onPress={closeOnBackdrop ? onClose : undefined}
          style={{ ...(require('react-native').StyleSheet.absoluteFillObject as object) }}
          accessibilityLabel="Hintergrund"
        />
        <View
          style={{
            width: '100%',
            maxWidth,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: tokens.radius.lg,
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
