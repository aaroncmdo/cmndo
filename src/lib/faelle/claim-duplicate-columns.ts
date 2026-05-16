// CMM-48 Phase 3 — Writer-Migration: faelle-Duplikat-Spalten -> claims.
//
// Es gibt 34 Spalten die auf `faelle` UND `claims` existieren und vom
// DB-Trigger sync_faelle_to_claims / sync_claims_to_faelle gespiegelt werden.
// Ziel der CMM-48-Migration: jeder Writer schreibt die Duplikat-Spalten auf
// `claims` (Single Source of Truth), nicht mehr auf `faelle`. Phase 4 (CMM-49)
// dropt anschliessend die faelle-Duplikat-Spalten.
//
// Sicher, weil beide Sync-Trigger `AFTER UPDATE OF <34 Spalten>` + `IS DISTINCT
// FROM OLD` nutzen:
//   - ein claims-Update spiegelt die Spalte sauber auf faelle zurueck
//     (bis CMM-49 die faelle-Spalten dropt) -> Reader die noch faelle lesen
//     bekommen weiter den korrekten Wert.
//   - ein faelle-Update OHNE Duplikat-Spalten triggert keinen Sync.
//
// Dieser Helper wird PRO CMM-48-PR um die jeweils migrierten Spalten erweitert,
// bis alle 14 migrationspflichtigen Writer durch sind. Erst dann darf CMM-49
// die faelle-Duplikat-Spalten droppen.

/**
 * Duplikat-Spalten, deren Writer bereits auf `claims` migriert wurden.
 * Wird pro CMM-48-PR erweitert.
 *
 * Stand PR-C (state-machine + lexdrive/process-event): Status-Timestamps.
 */
export const CLAIM_OWNED_DUPLICATE_COLUMNS = new Set<string>([
  'abgeschlossen_am',
  'kanzlei_uebergeben_am',
])

/**
 * Splittet ein `faelle`-Update-Objekt in den faelle-Teil (Workflow-Spalten,
 * bleiben auf faelle) und den claims-Teil (bereits migrierte Duplikat-Spalten).
 *
 * Der Caller schreibt `faelleUpdate` auf `faelle` und `claimsUpdate` via
 * `faelle.claim_id` auf `claims`. Bei einem Fall ohne `claim_id` (Legacy)
 * sollte der Caller das ungesplittete Update auf faelle schreiben — siehe
 * `splitOrKeepFaelleUpdate`.
 */
export function splitFaelleUpdate(update: Record<string, unknown>): {
  faelleUpdate: Record<string, unknown>
  claimsUpdate: Record<string, unknown>
} {
  const faelleUpdate: Record<string, unknown> = {}
  const claimsUpdate: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(update)) {
    if (CLAIM_OWNED_DUPLICATE_COLUMNS.has(key)) {
      claimsUpdate[key] = value
    } else {
      faelleUpdate[key] = value
    }
  }
  return { faelleUpdate, claimsUpdate }
}

/**
 * Wie `splitFaelleUpdate`, faellt aber bei fehlendem `claimId` (Legacy-Fall
 * ohne verknuepften Claim) auf das alte Verhalten zurueck: das komplette
 * Update bleibt auf `faelle`. So gehen Status-Timestamps bei claim-losen
 * Faellen nicht verloren.
 */
export function splitOrKeepFaelleUpdate(
  update: Record<string, unknown>,
  claimId: string | null,
): { faelleUpdate: Record<string, unknown>; claimsUpdate: Record<string, unknown> } {
  if (!claimId) {
    return { faelleUpdate: update, claimsUpdate: {} }
  }
  return splitFaelleUpdate(update)
}
