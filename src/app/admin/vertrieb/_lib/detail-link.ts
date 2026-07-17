// src/app/admin/vertrieb/_lib/detail-link.ts
// Deep-Link vom Vertrieb-Detail in die Verwaltungs-Akte pro Typ.
// P3: alle Ziele zeigen auf die unter /admin/vertrieb/* GEMOUNTETEN Routen (Re-Exports) —
// so bleibt „Vollständige Akte öffnen" IN der Konsole (unter dem Dach), statt zur Altroute
// rauszuspringen. SV + Werkstatt + Makler (B3) haben eine Einzel-Akte (/[id]); Partner-Leads
// → gemountete Liste. Die Altrouten bleiben zusätzlich erreichbar (Deep-Links/Bookmarks).
import type { VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'

export function detailLink(kind: VertriebKind, id: string): { href: string; label: string } {
  switch (kind) {
    case 'sv':
      return { href: `/admin/vertrieb/sachverstaendige/${id}`, label: 'Vollständige Akte öffnen' }
    case 'werkstatt':
      return { href: `/admin/vertrieb/werkstaetten/${id}`, label: 'Vollständige Akte öffnen' }
    case 'makler':
      return { href: `/admin/vertrieb/makler/${id}`, label: 'Vollständige Akte öffnen' }
    case 'partner-lead':
      return { href: '/admin/vertrieb/partner-leads', label: 'In der Partner-Leads-Liste öffnen' }
    case 'firmen-flotte':
      return { href: `/admin/vertrieb/firmen-flotte/${id}`, label: 'Vollständige Akte öffnen' }
  }
}
