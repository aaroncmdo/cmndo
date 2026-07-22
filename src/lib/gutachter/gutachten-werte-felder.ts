// S2: Editierbare Gutachten-Bewertungswerte (SV). Pure Module (KEIN 'use server') —
// Feldliste + Whitelist-Filter werden von der Action, der Card UND dem Test geteilt.

export type WerteFeldTyp = 'eur' | 'int' | 'bool'
export type WerteFeld = { key: string; label: string; typ: WerteFeldTyp }

// Reihenfolge = Anzeige-Reihenfolge in der GutachtenWerteCard.
export const SV_WERTE_FELDER: WerteFeld[] = [
  { key: 'reparaturkosten_netto', label: 'Reparaturkosten netto', typ: 'eur' },
  { key: 'reparaturkosten_brutto', label: 'Reparaturkosten brutto', typ: 'eur' },
  { key: 'minderwert', label: 'Wertminderung', typ: 'eur' },
  { key: 'wiederbeschaffungswert', label: 'Wiederbeschaffungswert', typ: 'eur' },
  { key: 'restwert', label: 'Restwert', typ: 'eur' },
  { key: 'nutzungsausfall_tage', label: 'Nutzungsausfall (Tage)', typ: 'int' },
  { key: 'gutachten_nutzungsausfall_tagessatz_eur', label: 'Nutzungsausfall-Tagessatz', typ: 'eur' },
  { key: 'wiederbeschaffungsdauer_tage', label: 'Wiederbeschaffungsdauer (Tage)', typ: 'int' },
  { key: 'totalschaden', label: 'Totalschaden', typ: 'bool' },
]

const ERLAUBT = new Set(SV_WERTE_FELDER.map((f) => f.key))

/** Filtert einen Patch auf die Whitelist; leerer String -> null (Feld löschen). */
export function filterWerteFelder(
  patch: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const cleaned: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!ERLAUBT.has(k)) continue
    cleaned[k] = v === '' ? null : (v as string | number | boolean | null)
  }
  return cleaned
}
