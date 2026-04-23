'use client'

// AAR-727: iOS-inspiriertes Modal mit Glass-Light-Backdrop, Spring-Entry,
// ESC-Close und Outside-Click-Close. Minimale API: open + onClose + children.
// Inhalt liegt im Dialog-Panel, nicht die Komponente füllt ihn selbst.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

export type IosModalProps = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  labelledBy?: string
  // Max-Breite. Default sm (max-w-md). Bottomsheets können full nutzen.
  size?: 'sm' | 'md' | 'lg' | 'full'
}

const SIZE: Record<NonNullable<IosModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  full: 'max-w-5xl',
}

export default function IosModal({ open, onClose, children, labelledBy, size = 'sm' }: IosModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={`relative w-full ${SIZE[size]} glass-light rounded-ios-lg shadow-ios-lg overflow-hidden`}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
