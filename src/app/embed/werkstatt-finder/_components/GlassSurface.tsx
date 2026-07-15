'use client'

// Glass-Card-Fläche fürs Finder-Overlay — 1:1 die Marketing-Glass-Cards (rounded-ios-lg +
// border-white/60 + bg-white/70 + shadow-glass-card + backdrop-blur-md). Lokale Kopie wie im
// Gutachter-Embed (kein cross-route Import).
import { cn } from '@/lib/utils'

export function GlassSurface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-ios-lg border border-white/60 bg-white/70 shadow-glass-card backdrop-blur-md', className)}>
      {children}
    </div>
  )
}
