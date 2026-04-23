'use client'

// AAR-727: iOS-inspirierter Button mit Spring-Scale auf Hover/Press.
// Varianten: primary (navy), accent (ondo-blue), ghost, danger.
// Kein CVA-Framework — die drei Varianten fliegen direkt als Styles rein.

import { forwardRef } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'

export type IosButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger'
export type IosButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<IosButtonVariant, string> = {
  primary: 'bg-[#0D1B3E] text-white hover:bg-[#1E3A5F]',
  accent: 'bg-[#4573A2] text-white hover:bg-[#3a6290]',
  ghost: 'bg-transparent text-[#0D1B3E] hover:bg-gray-100',
  danger: 'bg-red-500 text-white hover:bg-red-600',
}

const SIZE_CLASS: Record<IosButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

type Props = HTMLMotionProps<'button'> & {
  variant?: IosButtonVariant
  size?: IosButtonSize
}

const IosButton = forwardRef<HTMLButtonElement, Props>(function IosButton(
  { variant = 'primary', size = 'md', className = '', children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`inline-flex items-center justify-center gap-2 rounded-ios-md font-semibold shadow-ios-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4573A2] ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  )
})

export default IosButton
