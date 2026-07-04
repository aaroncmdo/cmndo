// Geteilter Vermittlungs-Kern (PURE, client-safe): Gate + Patch + Typen.
// KEINE Server-only-Imports (createAdminClient/notify) — die liegen in
// vermittlung-server.ts, damit brauchtWerkstattVermittlung auch im Client
// (FlowWizard-Gate) importierbar bleibt, ohne Server-Code ins Bundle zu ziehen.
// Authz liegt beim jeweiligen Caller (Rolle/Token/Ownership VOR dem Write).

export type VermittlungQuelle = 'dispatcher' | 'kunde' | 'embed' | 'gutachter' | 'kb'
export type VermittlungTarget = { target: 'lead' | 'claim'; id: string }

/** Minimal-Shape fuer das Sichtbarkeits-Gate (Lead ODER Claim). */
export type BedarfRow = {
  reparaturwunsch?: string | null
  reparatur_werkstatt_id?: string | null
  werkstatt_id?: string | null
  reparatur_vermittlung_status?: string | null
}

/**
 * Picker sichtbar? Wenn Reparatur ODER fiktive Abrechnung gewuenscht (SP4d: der
 * Kunde kann auch bei fiktiver Abrechnung eine Werkstatt suchen — z.B. guenstiger
 * reparieren + Differenz behalten), noch KEINE Partner-Werkstatt vermittelt, KEIN
 * Inbound-QR-Werkstatt (dann hat der Kunde faktisch schon eine) und der operative
 * Status offen ist. reparatur_werkstatt_id IS NULL dominiert: sobald vermittelt,
 * bleibt der Picker ueberall verborgen.
 */
export function brauchtWerkstattVermittlung(row: BedarfRow): boolean {
  return (
    (row.reparaturwunsch === 'reparatur' || row.reparaturwunsch === 'fiktiv') &&
    row.reparatur_werkstatt_id == null &&
    row.werkstatt_id == null &&
    (row.reparatur_vermittlung_status ?? 'offen') === 'offen'
  )
}

/**
 * Die fuenf Felder einer Zuweisung (die vier reparatur_werkstatt_* + status).
 * Type-Lag: die generierten DB-Types kennen die Spalten (noch) nicht -> der
 * Caller schreibt das Objekt via Record-/`as never`-Cast.
 */
export function buildZuweisungPatch(
  werkstattId: string,
  userId: string | null,
  quelle: VermittlungQuelle,
): Record<string, unknown> {
  return {
    reparatur_werkstatt_id: werkstattId,
    reparatur_werkstatt_zugewiesen_am: new Date().toISOString(),
    // uuid-Spalte: accountloser Kunde (Flow-Token, kein Login) hat keine userId ->
    // null schreiben, NIEMALS '' (leerer String wirft "invalid input syntax for type uuid").
    reparatur_werkstatt_zugewiesen_von: userId || null,
    reparatur_werkstatt_quelle: quelle,
    reparatur_vermittlung_status: 'vermittelt',
  }
}
