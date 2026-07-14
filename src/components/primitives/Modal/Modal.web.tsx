'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { tokens } from '@/lib/design-tokens'
import { CloseButton } from '../CloseButton/CloseButton.web'
import { SidebarVeil } from '../overlay/OverlayVeil.web'
import { SIDEBAR_WIDTH_VAR, VEIL_BG, Z_OVERLAY } from '../overlay/overlay-layers'
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

  // Der Schleier hat ZWEI Jobs, die sich in einem einzigen Element gegenseitig
  // ausschliessen — deshalb ist er gespalten (Details: overlay-layers.ts):
  //
  //   <SidebarVeil/>  liegt UNTER der Sidebar und dimmt den Hintergrund rings
  //                   um sie (die Sidebar ist ein eingeruecktes Panel).
  //   Content-Veil    liegt UEBER dem Content, spart die Sidebar per
  //                   left-Offset aus (sie bleibt scharf + bedienbar) und
  //                   faengt Klicks ab.
  //
  // Frueher war beides EIN weggeschobenes Element: dann blieb der Seiten-
  // Hintergrund rings um die Sidebar ungedimmt — ein heller Rahmen, waehrend
  // der Rest der App unter dem Dim lag.
  const outerClassName =
    placement === 'bottom-sheet'
      ? 'fixed inset-y-0 right-0 flex items-end md:items-center justify-center p-0 md:p-4'
      : 'fixed inset-y-0 right-0 flex items-center justify-center p-4'

  const outerStyle: React.CSSProperties = {
    left: SIDEBAR_WIDTH_VAR,
    zIndex: Z_OVERLAY,
  }

  // Body-Radius: auf Mobile bottom-sheet rounded-top-only, ab md voller Radius
  const bodyClassName =
    placement === 'bottom-sheet'
      ? 'relative w-full overflow-auto rounded-t-2xl md:rounded-2xl border border-claimondo-border bg-white shadow-ios-lg'
      : 'relative w-full overflow-auto rounded-2xl border border-claimondo-border bg-white shadow-ios-lg'

  return createPortal(
    <>
      <SidebarVeil />

      <div
        className={outerClassName}
        style={outerStyle}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {/* Content-Schleier — gleicher Dim-Ton wie der SidebarVeil, sonst
            entstuende genau die Kante, die wir beseitigen. */}
        <div
          onClick={closeOnBackdrop ? onClose : undefined}
          className="absolute inset-0 backdrop-blur-sm"
          style={{ backgroundColor: VEIL_BG }}
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
      </div>
    </>,
    document.body,
  )
}
