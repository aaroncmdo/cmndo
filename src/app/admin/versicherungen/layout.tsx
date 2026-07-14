import type { ReactNode } from 'react'

// P1: Parallel-Route-Slot `drawer` — Klick in der Liste oeffnet die Detail-View
// im Drawer, Deep-Link rendert die Full-Page.
// Rezept: docs/superpowers/detail-view-recipe.md

export default function VersicherungenLayout({
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
