import type { ReactNode } from 'react'

// AAR-151: Tab-Bar entfernt. /admin/sachverstaendige zeigt direkt die
// integrierte Karten-Ansicht (Sidebar + Map), Sub-Routen (/[id], /anlegen,
// /neu, /onboarding) rendern ohne zusätzlichen Wrapper. Der Admin-Layout-
// Chain (PageContainer h-full) bleibt unverändert.

export default function SachverstaendigeLayout({ children }: { children: ReactNode }) {
  return <div className="h-full">{children}</div>
}
