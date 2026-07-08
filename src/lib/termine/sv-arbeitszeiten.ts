// Pure SV-Arbeitszeiten-Logik — EINE Quelle fuer Termin-Engine (slots.ts konfigFuerAssignee) UND
// SV-Kalender-Anzeige (SVKalenderClient). KEINE Server-Imports -> auch aus Client-Components
// importierbar. Damit zeigt der Kalender EXAKT die Verfuegbarkeit, die der Finder anbietet — kein
// Drift Anzeige vs. Engine (Aaron 2026-07-08: "keine Termine versprechen die nicht eingehalten
// werden koennen" + Verfuegbarkeit im Kalender sichtbar).

export const TAG_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'] as const

// Default wenn arbeitszeiten=null (Befund 02.06.: alle SVs haben arbeitszeiten=null -> ohne Default
// 0 Slots ueberall). Liegt HIER (single source), NICHT dupliziert in slots.ts, damit Engine +
// Anzeige garantiert identisch sind.
export const DEFAULT_SV_ARBEITSZEITEN: Record<string, { von: string; bis: string }> = {
  mo: { von: '09:00', bis: '17:00' },
  di: { von: '09:00', bis: '17:00' },
  mi: { von: '09:00', bis: '17:00' },
  do: { von: '09:00', bis: '17:00' },
  fr: { von: '09:00', bis: '16:00' },
}

export type SvArbeitszeitenMap = Record<string, { von: string; bis: string } | undefined> | null

/**
 * Arbeitszeit eines Wochentags. dowJs: 0=So..6=Sa (wie Date.getDay()).
 * - arbeitszeiten=null -> DEFAULT_SV_ARBEITSZEITEN
 * - Wochentag in blockierteWochentage (ISO 1=Mo..7=So) -> null (nicht verfuegbar)
 * - Tag ohne Eintrag (z.B. Sa/So im Default, oder custom ohne diesen Tag) -> null
 */
export function svWochentagArbeitszeit(
  arbeitszeiten: SvArbeitszeitenMap,
  blockierteWochentage: number[] | null,
  dowJs: number,
): { von: string; bis: string } | null {
  const az = arbeitszeiten ?? DEFAULT_SV_ARBEITSZEITEN
  const dowIso = dowJs === 0 ? 7 : dowJs // ISO 1=Mo..7=So
  if ((blockierteWochentage ?? []).includes(dowIso)) return null
  const t = az[TAG_KEYS[dowJs]]
  return t ? { von: t.von, bis: t.bis } : null
}
