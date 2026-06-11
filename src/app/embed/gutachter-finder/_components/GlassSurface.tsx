'use client'

// AAR-956 — Glass-Card-Surface fürs Overlay, 1:1 nach der Marketing-Seite (claimondo.de):
// die Landing-Glass-Cards (FounderSection / VersichererProfileCard / beratung-anfragen)
// nutzen exakt: rounded-ios-lg + border-white/60 + bg-white/70 + shadow-glass-card +
// backdrop-blur-md. Genau "das was wir da haben" — keine eigenen --glass-*-Erfindungen.

import { cn } from '@/lib/utils'

export function GlassSurface({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-ios-lg border border-white/60 bg-white/70 shadow-glass-card backdrop-blur-md', className)}>
      {children}
    </div>
  )
}
