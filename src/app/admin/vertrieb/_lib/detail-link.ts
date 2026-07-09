// src/app/admin/vertrieb/_lib/detail-link.ts
// Deep-Link vom Vertrieb-Roster in die bestehende Verwaltungs-Oberfläche pro Typ.
// „Housing": das Umbrella-CRM ist der EINE Einstieg, jede Zeile führt in ihre Akte —
// bestehende Seiten werden verlinkt, NICHT neu gebaut (Umbrella-Spec §Housing).
// SV + Werkstatt haben eine Einzel-Akte (/[id]); Makler/Leads bisher nur Listen —
// dann in die jeweilige Liste (id geht dort noch verloren, Fokus = Follow-up).
import type { VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'

export function detailLink(kind: VertriebKind, id: string): { href: string; label: string } {
  switch (kind) {
    case 'sv':
      return { href: `/admin/sachverstaendige/${id}`, label: 'Vollständige Akte öffnen' }
    case 'werkstatt':
      return { href: `/admin/werkstaetten/${id}`, label: 'Vollständige Akte öffnen' }
    case 'makler':
      return { href: '/admin/makler', label: 'In der Makler-Liste öffnen' }
    case 'partner-lead':
      return { href: '/admin/partner-leads', label: 'In der Partner-Leads-Liste öffnen' }
  }
}
