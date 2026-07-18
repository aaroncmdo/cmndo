import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'

export type EmpfehlungRow = {
  werkstatt_id: string
  rang: number
  distanz_km: number | null
  match_snapshot: { gruende: { typ: string; text: string }[] }
}

/**
 * Mapt die vom SV gewaehlten Vorschlaege (max 3) auf persistierbare Rows.
 * Rang = Position in selectedIds (Auswahl-Reihenfolge). Nur IDs, die in
 * vorschlaege existieren, werden uebernommen (server-autoritativer Snapshot).
 * distanz_km Infinity -> null (kein sinnvoller Wert fuers Frontend).
 */
export function buildEmpfehlungRows(
  vorschlaege: WerkstattVorschlag[],
  selectedIds: string[],
): EmpfehlungRow[] {
  const byId = new Map(vorschlaege.map((v) => [v.id, v]))
  const rows: EmpfehlungRow[] = []
  for (const id of selectedIds) {
    const v = byId.get(id)
    if (!v) continue
    rows.push({
      werkstatt_id: v.id,
      rang: rows.length + 1,
      distanz_km: Number.isFinite(v.distanz_km) ? v.distanz_km : null,
      match_snapshot: { gruende: v.gruende.map((g) => ({ typ: g.typ, text: g.text })) },
    })
    if (rows.length >= 3) break
  }
  return rows
}
