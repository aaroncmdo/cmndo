'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { tokens } from '@/lib/design-tokens'
import { CloseButton } from '../CloseButton/CloseButton.web'
import { Z_OVERLAY } from '../overlay/overlay-layers'
import type { DrawerProps } from './Drawer.types'

export function Drawer({
  open,
  onClose,
  children,
  side = 'right',
  width = 420,
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  noPadding = false,
  mobileFullscreen = true,
  ariaLabel,
}: DrawerProps) {
  // SSR-safe: Portal-Target erst nach Mount setzen (Muster: Modal.web.tsx).
  //
  // WARUM Portal (nicht nur z-index): Inline gerendert sitzt der Drawer im Stacking
  // Context irgendeines transform-/filter-/backdrop-Vorfahren der Seite -- dann ist
  // sein z-[1000] nur INNERHALB dieses Kontexts wirksam und verliert auf Root-Ebene
  // gegen body-nahe fixed-Elemente. Prod-Playwright-belegt (16.07.): der Chat-FAB
  // fing mit z-950 weiterhin Klicks auf die Drawer-Footer-Ecke ab, OBWOHL der Drawer
  // z-1000 traegt. Das Portal hebt den Drawer in den Root-Kontext -- exakt wie das
  // Schwester-Primitive Modal.web.tsx es seit jeher macht.
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

  // Tailwind-Klassen für mobile-fullscreen + Slide-Animation. width-Style
  // wird ab md+ angewandt (max-w override über Tailwind-Klassen).
  const slideClass =
    side === 'right' ? 'animate-in slide-in-from-right' : 'animate-in slide-in-from-left'
  const widthClass = mobileFullscreen ? 'w-full md:w-[var(--drawer-w)]' : ''

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: Z_OVERLAY }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Backdrop */}
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 backdrop-blur-sm"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--brand-primary, #0D1B3E) 22%, transparent)',
        }}
      />

      {/* Drawer-Body */}
      <div
        className={`absolute top-0 bottom-0 ${widthClass} ${slideClass} overflow-auto shadow-ios-lg`}
        style={
          {
            [side]: 0,
            maxWidth: '100vw',
            width: mobileFullscreen ? undefined : width,
            backgroundColor: tokens.glass.light.bg,
            backdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
            WebkitBackdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
            borderLeft: side === 'right' ? `1px solid ${tokens.glass.light.border}` : undefined,
            borderRight: side === 'left' ? `1px solid ${tokens.glass.light.border}` : undefined,
            padding: noPadding ? 0 : tokens.spacing[6],
            // CSS-Custom-Property für md+ Breite (Tailwind kann zur Build-Zeit
            // keine numerischen JS-Werte in arbitrary-value-Klassen einbauen,
            // siehe md:w-[var(--drawer-w)] oben).
            '--drawer-w': `${width}px`,
          } as React.CSSProperties
        }
      >
        {!hideCloseButton && <CloseButton onPress={onClose} offset={12} />}
        {children}
      </div>
    </div>,
    document.body,
  )
}
