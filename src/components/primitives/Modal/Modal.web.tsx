'use client'
import { useEffect } from 'react'
import { tokens } from '@/lib/design-tokens'
import { CloseButton } from '../CloseButton/CloseButton.web'
import type { ModalProps } from './Modal.types'

export function Modal({
  open,
  onClose,
  children,
  maxWidth = 480,
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  ariaLabel,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEsc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEsc, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.spacing[4],
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Backdrop-Blur — blockiert Klicks auf Main */}
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(13, 27, 62, 0.22)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Dialog-Body — Glass-Light */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth,
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          backgroundColor: tokens.glass.light.bg,
          backdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          border: `1px solid ${tokens.glass.light.border}`,
          borderRadius: tokens.radius.lg,
          boxShadow: tokens.shadow.lg,
          padding: tokens.spacing[6],
        }}
      >
        {!hideCloseButton && <CloseButton onPress={onClose} offset={12} />}
        {children}
      </div>
    </div>
  )
}
