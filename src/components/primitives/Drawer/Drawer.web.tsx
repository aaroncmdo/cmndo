'use client'
import { useEffect } from 'react'
import { tokens } from '@/lib/design-tokens'
import { CloseButton } from '../CloseButton/CloseButton.web'
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
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(13, 27, 62, 0.18)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [side]: 0,
          width,
          maxWidth: '100vw',
          backgroundColor: tokens.glass.light.bg,
          backdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          borderLeft: side === 'right' ? `1px solid ${tokens.glass.light.border}` : undefined,
          borderRight: side === 'left' ? `1px solid ${tokens.glass.light.border}` : undefined,
          boxShadow: tokens.shadow.lg,
          overflow: 'auto',
          padding: tokens.spacing[6],
        }}
      >
        {!hideCloseButton && <CloseButton onPress={onClose} offset={12} />}
        {children}
      </div>
    </div>
  )
}
