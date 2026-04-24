'use client'
import { useEffect } from 'react'
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
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
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
          position: 'relative',
          width: '100%',
          maxHeight: `${maxHeightRatio * 100}vh`,
          overflow: 'auto',
          backgroundColor: tokens.glass.light.bg,
          backdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${tokens.glass.light.blur}px) saturate(180%)`,
          borderTopLeftRadius: tokens.radius.lg,
          borderTopRightRadius: tokens.radius.lg,
          borderTop: `1px solid ${tokens.glass.light.border}`,
          boxShadow: tokens.shadow.lg,
          padding: tokens.spacing[6],
          paddingTop: tokens.spacing[4],
        }}
      >
        {/* Drag-Handle */}
        <div
          style={{
            width: 40,
            height: 4,
            backgroundColor: tokens.colors.border,
            borderRadius: tokens.radius.full,
            margin: '0 auto',
            marginBottom: tokens.spacing[4],
          }}
          aria-hidden
        />
        {children}
      </div>
    </div>
  )
}
