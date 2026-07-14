import type { ReactNode } from 'react'

// P1 (Detail-View-Konsistenz): Parallel-Route-Slot `drawer`.
// Klick in der Liste (Soft-Nav) -> @drawer/(.)[id] rendert die Detail-View im
// Drawer ueber der Liste. Direkter URL-Aufruf (Deep-Link/Hard-Nav) matcht den
// Intercept NICHT -> Next rendert die Full-Page [id]/page.tsx.
// Rezept: docs/superpowers/detail-view-recipe.md

export default function OrganisationenLayout({
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
