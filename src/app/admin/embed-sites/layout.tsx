import type { ReactNode } from 'react'

// P1: Parallel-Route-Slot `drawer` — Rezept: docs/superpowers/detail-view-recipe.md

export default function EmbedSitesLayout({
  children,
  drawer,
}: {
  children: ReactNode
  drawer: ReactNode
}) {
  return (
    <div className="h-full">
      {children}
      {drawer}
    </div>
  )
}
