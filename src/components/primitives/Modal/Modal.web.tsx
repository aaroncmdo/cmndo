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

  // AAR-864: Bevorzuge den Shell-spezifischen Portal-Root (#sv-modal-root),
  // der in GutachterShell als fixed div mit left=256px gesetzt wird.
  // Darin nutzen Modals position:absolute (Container-Block = Portal-Root)
  // statt position:fixed (Container-Block = Viewport). Das ist zuverlässiger
  // als das CSS-Var-Pattern und schließt die Sidebar garantiert aus.
  // Fallback → document.body mit fixed + var(--app-sidebar-width, 0px).
  const svRoot = document.getElementById('sv-modal-root')
  const portalTarget = svRoot ?? document.body
  const inSvRoot = !!svRoot

  const outerClassName = inSvRoot
    ? placement === 'bottom-sheet'
      ? 'absolute inset-0 flex items-end md:items-center justify-center p-0 md:p-4'
      : 'absolute inset-0 flex items-center justify-center p-4'
    : placement === 'bottom-sheet'
      ? 'fixed inset-y-0 right-0 z-[1000] flex items-end md:items-center justify-center p-0 md:p-4'
      : 'fixed inset-y-0 right-0 z-[1000] flex items-center justify-center p-4'
  const outerStyle: React.CSSProperties = inSvRoot
    ? {}
    : { left: 'var(--app-sidebar-width, 0px)' }

  // Body-Radius: auf Mobile bottom-sheet rounded-top-only, ab md voller Radius
  const bodyClassName =
    placement === 'bottom-sheet'
      ? 'relative w-full overflow-auto rounded-t-2xl md:rounded-2xl border border-claimondo-border bg-white shadow-ios-lg'
      : 'relative w-full overflow-auto rounded-2xl border border-claimondo-border bg-white shadow-ios-lg'

  return createPortal(
    <div className={outerClassName} style={outerStyle} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      {/* Backdrop — pointer-events-auto überschreibt pointer-events-none des
          Portal-Roots damit Klicks korrekt abgefangen werden. */}
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 backdrop-blur-sm pointer-events-auto"
        style={{ backgroundColor: 'rgba(13, 27, 62, 0.22)' }}
      />

      {/* Dialog-Body — Glass-Light. pointer-events-auto damit Inputs/Buttons
          im Modal trotz pointer-events-none Portal-Root bedienbar sind. */}
      <div
        className={`${bodyClassName} pointer-events-auto`}
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
