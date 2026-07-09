// src/app/admin/vertrieb/_lib/filter-kontakte.ts
// Reine Roster-Filter/Sort-Logik (aus der Komponente extrahiert -> testbar). Filtert nach
// kind-Segment, Stufe und Freitext (Name/Ort/E-Mail), sortiert alphabetisch nach Name.
import type { VertriebKontakt, VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

export type RosterFilter = {
  seg: VertriebKind | 'alle'
  search: string
  stufe: VertriebStufe | 'alle'
}

export function filterKontakte(kontakte: VertriebKontakt[], f: RosterFilter): VertriebKontakt[] {
  const q = f.search.trim().toLowerCase()
  return kontakte
    .filter((k) => f.seg === 'alle' || k.kind === f.seg)
    .filter((k) => f.stufe === 'alle' || k.stufe === f.stufe)
    .filter(
      (k) =>
        !q ||
        (k.name ?? '').toLowerCase().includes(q) ||
        (k.ort ?? '').toLowerCase().includes(q) ||
        (k.email ?? '').toLowerCase().includes(q),
    )
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'de'))
}
