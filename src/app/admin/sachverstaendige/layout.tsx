import type { ReactNode } from 'react'

// AAR-151: Tab-Bar entfernt. /admin/sachverstaendige zeigt direkt die
// integrierte Karten-Ansicht (Sidebar + Map), Sub-Routen (/[id], /anlegen,
// /neu, /onboarding) rendern ohne zusätzlichen Wrapper.
//
// AAR-691: Parallel-Route-Slot `drawer` hinzugefügt. Ermöglicht
// Intercepting-Routes — Klick auf SV-Pin navigiert zu /<uuid> und lädt
// dessen Server-Page in einem Drawer über der Karte statt Full-Page-
// Reload. Direkter URL-Aufruf fällt auf die Full-Page `[id]/page.tsx`
// zurück (Deep-Link-Kompatibilität).

export default function SachverstaendigeLayout({
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
