'use client'

// AAR-727: iOS-Popover mit Glass-Light-Hintergrund, Spring-Entry,
// Outside-Click + ESC schließen. Der Konsument platziert den Popover
// relativ zu seinem Trigger — dieser Component kümmert sich nur um
// Visual + Lifecycle.

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export type IosPopoverProps = {
  open: boolean
  onClose: () => void
  anchorClassName?: string
  className?: string
  children: React.ReactNode
  labelledBy?: string
}

export default function IosPopover({
  open,
  onClose,
  anchorClassName = '',
  className = '',
  children,
  labelledBy,
}: IosPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose])

  return (
    <div className={`relative ${anchorClassName}`}>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            role="dialog"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className={`glass-light rounded-ios-lg shadow-ios-lg z-40 ${className}`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
