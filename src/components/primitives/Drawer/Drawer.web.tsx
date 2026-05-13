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
  width = 420,
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  noPadding = false,
  mobileFullscreen = true,
  ariaLabel,
}: DrawerProps) {
  useEffect(() => {
    if (!open || !closeOnEsc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEsc, onClose])

  if (!open) return null

  // Tailwind-Klassen für mobile-fullscreen + Slide-Animation. width-Style
  // wird ab md+ angewandt (max-w override über Tailwind-Klassen).
  const slideClass =
    side === 'right' ? 'animate-in slide-in-from-right' : 'animate-in slide-in-from-left'
  const widthClass = mobileFullscreen ? 'w-full md:w-[var(--drawer-w)]' : ''

  return (
    <div
      className="fixed inset-0 z-[1000]"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Backdrop */}
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(13, 27, 62, 0.22)' }}
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
    </div>
  )
}
