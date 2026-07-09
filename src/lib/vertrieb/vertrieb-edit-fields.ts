// src/lib/vertrieb/vertrieb-edit-fields.ts
// Whitelist der editierbaren Felder je kind. Mappt den EINHEITLICHEN API-Feldnamen
// (z.B. 'notizen') auf die REALE DB-Spalte je Tabelle — partner_leads nutzt die
// bestehende Spalte 'notiz' (Singular), die uebrigen 'notizen'. So schreibt das CRM
// in dieselbe Spalte wie die jeweilige Verwaltungs-Oberflaeche (kein Duplikat).
// NICHT 'use server' (AAR-664: keine const-Exporte aus 'use server'-Files).
import type { VertriebKind } from './vertrieb-kontakt.types'

export const VERTRIEB_EDIT_TARGET: Partial<
  Record<VertriebKind, { table: string; columns: Record<string, string> }>
> = {
  sv: { table: 'sachverstaendige', columns: { notizen: 'notizen' } },
  'partner-lead': { table: 'partner_leads', columns: { notizen: 'notiz' } },
  makler: { table: 'makler', columns: { notizen: 'notizen' } },
  werkstatt: { table: 'werkstaetten', columns: { notizen: 'notizen' } },
}

/** Loest den API-Feldnamen auf die reale DB-Spalte je kind auf (oder null, wenn nicht editierbar). */
export function resolveEditColumn(
  kind: VertriebKind,
  feld: string,
): { table: string; column: string } | null {
  const target = VERTRIEB_EDIT_TARGET[kind]
  const column = target?.columns[feld]
  if (!target || !column) return null
  return { table: target.table, column }
}
