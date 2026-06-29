// AAR Werkstatt-Vermittlung (Phase 1, Task 4): Reine Patch-Bau-Logik.
//
// Bewusst in einem eigenen (NICHT 'use server') Modul: Next.js erlaubt aus
// einer 'use server'-Datei nur async-Funktions-Exporte — ein synchroner
// Helper-Export daraus wuerde im Client-Bundle zu `undefined` und bricht den
// Build (AGENTS.md §Server-Actions, AAR-664). Hier liegt er server-/client-
// neutral und ist ohne Supabase-Mock testbar.

/**
 * Liefert exakt die vier reparatur_werkstatt_*-Felder fuer eine
 * Dispatcher-Zuweisung. Type-Lag: die generierten DB-Types kennen die Spalten
 * noch nicht -> Record-Cast beim Schreiben durch den Caller.
 */
export function buildZuweisungPatch(
  werkstattId: string,
  userId: string,
): Record<string, unknown> {
  return {
    reparatur_werkstatt_id: werkstattId,
    reparatur_werkstatt_zugewiesen_am: new Date().toISOString(),
    reparatur_werkstatt_zugewiesen_von: userId,
    reparatur_werkstatt_quelle: 'dispatcher',
  }
}
