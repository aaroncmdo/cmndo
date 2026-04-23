'use client'

// AAR-727: iOS-inspirierte Card. Rounded-ios-md + subtle shadow. Optional
// interactive (Hover-Lift). Pure Presentational-Component — keine Logik.

import type { HTMLAttributes } from 'react'

export type IosCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const PADDING: Record<NonNullable<IosCardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export default function IosCard({
  interactive = false,
  padding = 'md',
  className = '',
  children,
  ...rest
}: IosCardProps) {
  const base = 'bg-white rounded-ios-md shadow-ios-sm border border-[var(--claimondo-border)]'
  const hover = interactive ? 'transition-shadow hover:shadow-ios-md cursor-pointer' : ''
  return (
    <div className={`${base} ${PADDING[padding]} ${hover} ${className}`} {...rest}>
      {children}
    </div>
  )
}
