// AAR-752: Zentrales Permission-Modell — 2 Ebenen (Resource × R/W +
// Capabilities) statt der bisher 4 separaten Funktionen (requirePortalAccess,
// canPerform, canEditField, getVisibleFallSections).
//
// Design-Entscheidungen:
// - Resources sind grobe Domänen (fall / abrechnung / dokumente / ...).
//   Read/Write kontrolliert Tab-Sichtbarkeit und Bulk-Edit.
// - Capabilities sind explizite Feature-Flags für einzelne Buttons/Actions
//   innerhalb einer Resource (z.B. "briefing.regenerate"). Bewusst klein
//   gehalten — nur wo Resource+RW nicht reicht.
// - Feld-Whitelist pro Resource (`stammdaten_fields`) ersetzt das alte
//   Prefix-Matching in `field-permissions.ts`.
// - Scope = RLS-Ebene (welche Rows die Rolle überhaupt sieht). Wird auf
//   DB-Seite via Policies durchgesetzt; der Code-Layer ist UI-Hygiene.

/**
 * Grobe Ressource-Kategorien. Eine Tab-Sichtbarkeit hängt am Resource-
 * Read-Level, eine Inline-Edit-Erlaubnis am Write-Level.
 */
export type PermissionResource =
  | 'fall'
  | 'stammdaten'
  | 'abrechnung'
  | 'dokumente'
  | 'chat'
  | 'tasks'
  | 'prozess'

/**
 * Read/Write-Level pro Resource.
 * - none: Resource nicht sichtbar (Tab ausgeblendet)
 * - read: sichtbar aber nicht editierbar (Edit-Buttons versteckt)
 * - write: voller Lese- und Schreibzugriff
 */
export type PermissionLevel = 'none' | 'read' | 'write'

/**
 * Zeilen-Sichtbarkeit (Scope). Wird auf DB-Ebene via RLS durchgesetzt,
 * hier nur dokumentarisch + für Query-Filter im App-Layer.
 * - all: sieht alle Rows (Admin)
 * - assigned: zugewiesene (KB: kundenbetreuer_id = me; Dispatch: alle Leads)
 * - own: nur eigene (SV: sv_id = me; Kunde: kunde_id = me)
 * - makler_kunden: Makler sieht Fälle seiner Versicherungskunden
 * - none: keine Row-Sichtbarkeit
 */
export type PermissionScope =
  | 'all'
  | 'assigned'
  | 'own'
  | 'makler_kunden'
  | 'none'

/**
 * Feingranulare Capabilities — Feature-Flags innerhalb einer Resource.
 * Bewusst klein gehalten, wächst organisch. Benennung: `resource.action`.
 *
 * Neue Capability hinzufügen = hier ergänzen + pro Rolle in der Matrix
 * entscheiden ob sie sie hat.
 */
export type PermissionCapability =
  // Fall-Meta (destruktive Actions + Zuweisung)
  | 'fall.override_status'       // Status manuell umschreiben
  | 'fall.override_phase'        // Subphase manuell umschreiben
  | 'fall.reassign_sv'           // SV neu zuweisen
  | 'fall.delete'                // Fall hart löschen
  | 'fall.deactivate'            // Fall deaktivieren + reaktivieren
  // Briefing + KI
  | 'briefing.regenerate'        // AI-Briefing neu erzeugen
  // Dokumente
  | 'dokumente.request'          // Dokument beim Kunden anfordern
  | 'dokumente.qc'               // QC-Checkliste abhaken
  | 'dokumente.filmcheck'        // Filmcheck durchführen
  // Tasks
  | 'tasks.create_for_other'     // Task für anderen User anlegen
  | 'tasks.delegate'             // Task delegieren
  | 'tasks.view_team'            // Team-Tasks (nicht nur eigene) sehen
  // Stammdaten (Feld-Gruppen-Spezifisch)
  | 'stammdaten.edit_kanzlei_felder'  // mandatsnummer, kanzlei_*-Felder
  // Abrechnung
  | 'abrechnung.approve'         // Abrechnung freigeben/auszahlen
  // VS-Regulierung (VS-Reaktions-Flow editieren)
  | 'vs_regulierung.edit'
  // Rollen-Verwaltung
  | 'rollen.assign'              // Rolle eines anderen Users ändern

/**
 * Komplette Permission-Definition einer Rolle.
 */
export type Permission = {
  /** RLS-Zeilen-Sichtbarkeit (dokumentarisch, Enforcement via DB-Policy) */
  scope: PermissionScope
  /** Read/Write pro Resource-Domäne */
  resources: Record<PermissionResource, PermissionLevel>
  /** Feingranulare Feature-Flags */
  capabilities: ReadonlySet<PermissionCapability>
  /**
   * Optional: Feld-Whitelist für stammdaten-Writes. Wird nur konsultiert
   * wenn `resources.stammdaten === 'write'`. Format: exact field names
   * oder prefix-Pattern mit trailing `*` (z.B. `'fahrzeug_*'`).
   * Leer/undefined = alle Stammdaten-Felder editierbar (default für Admin).
   */
  stammdaten_fields?: readonly string[]
}

/**
 * System-Felder — niemals editierbar, unabhängig von der Rolle.
 * Zentralisiert aus field-permissions.ts für Consumer der neuen Matrix.
 */
export const SYSTEM_FIELDS: ReadonlySet<string> = new Set<string>([
  'id',
  'claim_nummer',
  'lead_id',
  'kunde_id',
  'sv_id',
  'created_at',
  'updated_at',
  'abgeschlossen_am',
  'as_salesforce_id',
  'mandatsnummer',
])
