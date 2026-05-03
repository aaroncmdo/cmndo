'use client'

// Tropfen-Reveal-Animation für Tab-Content-Wechsel.
// Nutze als direkten Kinder-Wrapper innerhalb von <AnimatePresence>.

import { motion, AnimatePresence, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

const variants: Variants = {
  enter: {
    opacity: 0,
    y: -6,
    clipPath: 'ellipse(60% 15% at 50% 0%)',
  },
  center: {
    opacity: 1,
    y: 0,
    clipPath: 'ellipse(200% 200% at 50% 0%)',
    transition: {
      duration: 0.3,
      ease: [0.34, 1.2, 0.64, 1] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    y: 6,
    clipPath: 'ellipse(60% 15% at 50% 100%)',
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 0.6, 1] as [number, number, number, number],
    },
  },
}

export function TabDropContent({
  tabKey,
  children,
  className = '',
}: {
  tabKey: string
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        className={className}
        style={{ willChange: 'clip-path, opacity, transform' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
