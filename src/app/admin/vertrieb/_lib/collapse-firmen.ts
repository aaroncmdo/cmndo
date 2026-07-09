// src/app/admin/vertrieb/_lib/collapse-firmen.ts
// Roster-Dedup: Mehr-Standort-Firmen zu EINER Zeile zusammenfassen.
// Der DAT-/Excel-Import legte pro Filiale eine eigene sv_leads-Zeile an (z.B.
// „Steinacker Ingenieurgesellschaft" 5×, „Dipl.-Ing. W. Lütz GmbH" 4×) — im
// Prospect-Roster ist das Rauschen (die Firma kontaktiert man einmal). Die Karte
// behält bewusst alle Filialen (View unverändert), nur die Liste kollabiert.
// Gruppiert nach (kind + normalisiertem Name); zählt die Standorte.
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

export type VertriebZeile = VertriebKontakt & { standorte: number }

export function collapseByFirma(kontakte: VertriebKontakt[]): VertriebZeile[] {
  const groups = new Map<string, VertriebZeile>()
  const order: string[] = []
  for (const k of kontakte) {
    const nameKey = k.name ? k.name.trim().toLowerCase() : null
    // Ohne Namen (kein Firmen-/Personenname) nicht gruppieren — eigene Zeile je id.
    const key = nameKey ? `${k.kind}::${nameKey}` : `id::${k.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.standorte += 1
    } else {
      groups.set(key, { ...k, standorte: 1 })
      order.push(key)
    }
  }
  // Eingabe-Reihenfolge erhalten (filterKontakte hat bereits sortiert).
  return order.map((key) => groups.get(key)!)
}
