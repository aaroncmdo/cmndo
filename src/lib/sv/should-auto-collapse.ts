// Feldmodus-Operativ-Audit 2026-07-17: pure Heuristik fuer die Smart-Collapse
// der AktuellerStopCard. Eigenes Modul (node-unit-testbar, kein DOM/Supabase).
//
// PRINZIP (app/rollen-weit gueltig fuer JEDE Auto-Collapse-/Auto-Hide-Heuristik):
// Ein NULL/unbekannter Heuristik-Input darf eine PRIMAERAKTION NICHT verstecken.
// „Unbekannt" (hier: keine Distanz -> kein Geofence: fehlende Koords, GPS
// verweigert, Tiefgarage) ist NICHT dasselbe wie „weit weg". Bei „weit weg"
// (SV faehrt, Navigation ist primaer) ist Kollabieren korrekt; bei „unbekannt"
// muss die Card offen bleiben, sonst ist die Aktion „Ich bin angekommen"
// unerreichbar. Faustregel: unknown -> SHOW, nur bekannte grosse Distanz -> HIDE.

/**
 * True, wenn die Stop-Card auto-kollabieren soll (kompakte Ansicht).
 * NUR bei einer BEKANNTEN Distanz oberhalb der Schwelle — `null` (unbekannt)
 * kollabiert NIE (sonst versteckt es die Primaeraktion permanent).
 */
export function shouldAutoCollapseStopCard(
  distanceMeters: number | null,
  thresholdMeters: number,
): boolean {
  return distanceMeters != null && distanceMeters > thresholdMeters
}
