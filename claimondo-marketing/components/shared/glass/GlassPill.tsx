'use client'

// AAR-glass-s1: Universelle Glass-Pill — Container für Status-Badges,
// Step-Indicators, oder beliebigen Pill-Content.
//
// Style kommt aus globals.css-Vars (--glass-bg, --glass-blur, etc.),
// damit Brand-Provider die Pill automatisch brandet via color-mix().
// B2B-Dark-Surface aktiviert sich automatisch wenn ein Parent
// [data-surface="b2b-dark"] gesetzt hat.

import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
}

export function GlassPill({ children, className }: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-[22px] py-[10px] whitespace-nowrap leading-[1.1]',
        'rounded-[var(--glass-radius-pill)]',
        '[background:var(--glass-bg)]',
        '[backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]',
        '[border:var(--glass-border)]',
        '[box-shadow:var(--glass-shadow)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
