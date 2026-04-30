'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  noPadding = false,
  ariaLabel,
  placement = 'center',
}: ModalProps) {
  // SSR-safe: Portal-Target erst nach Mount setzen, sonst kracht
  // document.body in der Server-Render-Phase.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open || !closeOnEsc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEsc, onClose])

  if (!open || !mounted) return null

  // Outer-Container: bottom-sheet rutscht auf Mobile von unten ein,
  // ab md+ verhält er sich wie ein normales centered Modal.
  // Inline-styles können keine Media-Queries — daher Tailwind-Klassen.
  const outerClassName =
    placement === 'bottom-sheet'
      ? 'fixed inset-0 z-[1000] flex items-end md:items-center justify-center p-0 md:p-4'
      : 'fixed inset-0 z-[1000] flex items-center justify-center p-4'

  // Body-Radius: auf Mobile bottom-sheet rounded-top-only, ab md voller Radius
  const bodyClassName =
    placement === 'bottom-sheet'
      ? 'relative w-full overflow-auto rounded-t-2xl md:rounded-2xl border border-claimondo-border bg-white shadow-ios-lg'
      : 'relative w-full overflow-auto rounded-2xl border border-claimondo-border bg-white shadow-ios-lg'

  // Portal nach document.body — sonst ankern fixed-Children an
  // Wrapper-Containing-Blocks (backdrop-filter, transform etc.) und
  // werden in deren Layout eingesperrt.
  return createPortal(
    <div className={outerClassName} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      {/* Backdrop */}
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(13, 27, 62, 0.22)' }}
      />

      {/* Dialog-Body — Glass-Light */}
      <div
        className={bodyClassName}
        style={{
          maxWidth,
          maxHeight: placement === 'bottom-sheet' ? '90vh' : 'calc(100vh - 32px)',
          backgroundColor: tokens.glass.light.bg,
          backdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          padding: noPadding ? 0 : tokens.spacing[6],
        }}
      >
        {!hideCloseButton && <CloseButton onPress={onClose} offset={12} />}
        {children}
      </div>
    </div>,
    document.body,
  )
}
