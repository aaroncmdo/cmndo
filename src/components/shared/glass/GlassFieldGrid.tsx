'use client'

// AAR-glass-s1: Pair-Layout für Inputs (z.B. Vorname + Nachname).
// `minmax(0, 1fr)` ist Pflicht — sonst überschießen Pills den Container-Rand
// wenn ihre Content-Breite die Spalten-Breite übersteigt.

import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
}

export function GlassFieldGrid({ children, className }: Props) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5',
        className,
      )}
    >
      {children}
    </div>
  )
}
