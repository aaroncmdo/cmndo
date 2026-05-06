// 2026-05-06: Feldmodus zurück auf Full-Bleed-Overlay (Decision-Reversal).
// Hintergrund: SV ist im Feldmodus unterwegs auf dem Telefon — der Wrapper
// (Sidebar 256px + Header + Padding) frisst zu viel Karten-Fläche. Heute +
// /route bleiben im normalen Wrapper, NUR Feldmodus geht fullscreen.
//
// z-[1200] > Sidebar (lg:z-[1100]) damit das Overlay den ganzen Viewport
// einschließlich Sidebar-Spalte abdeckt. GutachterShell rendert den
// <aside> bei isFeldmodus eh nicht mehr (Z. 305: !isFeldmodus &&), aber
// das z-[1200] ist Belt-and-Suspenders für Modale & Portale.
//
// Vorher (#481) war das Overlay rausgenommen worden auf der Annahme dass
// Mobile-Wrapper-Padding tolerierbar wäre — Praxis-Test zeigt das
// Gegenteil, daher wieder Full-Bleed.

import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function FeldmodusLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1200] bg-white overflow-hidden">
      {children}
    </div>
  )
}
