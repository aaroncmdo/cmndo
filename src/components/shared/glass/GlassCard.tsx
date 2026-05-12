'use client'

// AAR-glass-s1: Multi-Field-Container. Transparentere bg + stärkerer blur,
// damit nested Glass-Pills dahinter durchscheinen.
// `*` innerhalb hat box-sizing: border-box automatisch (siehe globals.css
// shadcn-Default + Tailwind-Preflight) — pills brechen nicht über Card-Rand
// solange Grid mit minmax(0,1fr) gesetzt wird (siehe <GlassFieldGrid>).

import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
}

export function GlassCard({ children, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-6',
        'rounded-[var(--glass-radius-card)]',
        '[background:var(--glass-bg-nested)]',
        '[backdrop-filter:var(--glass-blur-strong)] [-webkit-backdrop-filter:var(--glass-blur-strong)]',
        '[border:var(--glass-border-nested)]',
        '[box-shadow:var(--glass-shadow-card)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
