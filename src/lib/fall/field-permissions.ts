// AAR-161 / W1: Fallakte Field-Permissions — Rolle → editierbare Felder.
//
// Wird vom FallContext (W2) konsumiert. Die Inline-Edit-Components (W2)
// verstecken das Edit-Icon wenn canEdit(field) === false. Server-Actions
// müssen dieselbe Regel serverseitig durchsetzen — nicht nur UI (BUG-Klasse:
// „read-only"-UI ohne Server-Check ist eine Sicherheitslücke).
//
// Rollen (aus profiles.rolle, DB-verifiziert):
//   - admin, kundenbetreuer — vollständiger Editier-Zugriff
//   - sachverstaendiger — nur Fahrzeug + Besichtigungsort + Gutachten
//   - kunde — read-only
//   - dispatch — keine Fallakte-Edits (Dispatch = eigener Client vor Fall-
//     Erstellung; sobald Fall existiert keine Write-Permissions)
//
// Bei Status `abgeschlossen` oder `storniert` wird ALLES read-only.
//
// Hinweis: profiles.rolle in der DB enthält nur diese 5 Werte (per SELECT
// DISTINCT verifiziert). Frühere Annahmen über 'gutachter'/'sachverstaendige'/
// 'kanzlei'/'buero'/'akademie' waren falsch — diese Strings sind nie in der
// DB und der Code hat sie zur Laufzeit nie matchen können.

export type FallakteRolle =
  | 'admin'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'kunde'
  | 'dispatch'

/** System-Felder — NIEMALS editierbar, unabhängig von der Rolle. */
export const SYSTEM_FIELDS = new Set<string>([
  'id',
  'fall_nummer',
  'lead_id',
  'kunde_id',
  'sv_id',
  'created_at',
  'updated_at',
  'abgeschlossen_am',
  'as_salesforce_id',
  'mandatsnummer',
])

/**
 * SV-editierbare Felder. Alles was der Sachverständige im Rahmen der
 * Besichtigung + Gutachten erfasst. Prefix-basierter Match.
 */
const SV_EDITABLE_PREFIXES = [
  'fahrzeug_',
  'besichtigungsort_',
  'gutachten_',
  'kernwert_',
  'schadens_',
  'foto_',
]

/** Zusätzlich zu Prefixen — explizite SV-Felder. */
const SV_EDITABLE_FIELDS = new Set<string>([
  'fin',
  'halter_vorname',
  'halter_nachname',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'hsn',
  'tsn',
  'cardentity_report',
  'nachbesichtigung_konfrontation',
])

/**
 * Liefert `true` wenn die Rolle dieses Feld im aktuellen Fall-Status
 * bearbeiten darf.
 */
export function canEditField(
  rolle: FallakteRolle | string | null | undefined,
  field: string,
  status: string | null | undefined,
): boolean {
  if (!rolle) return false
  if (SYSTEM_FIELDS.has(field)) return false

  // AAR-161 Spec: abgeschlossen / storniert → alles read-only
  if (status === 'abgeschlossen' || status === 'storniert') return false

  switch (rolle) {
    case 'admin':
    case 'kundenbetreuer':
      return true

    case 'sachverstaendiger':
      if (SV_EDITABLE_FIELDS.has(field)) return true
      return SV_EDITABLE_PREFIXES.some((p) => field.startsWith(p))

    case 'kunde':
    case 'dispatch':
      return false

    default:
      return false
  }
}

/**
 * Convenience: Rollen-Typ-Guard für die Sichtbarkeit einer Section-
 * Komponente als Ganzes. Eine Section ist „editable" wenn mindestens ein
 * Feld darin bearbeitbar ist (UI kann den Edit-Icon-Container verstecken).
 */
export function hasAnyEditPermission(
  rolle: FallakteRolle | string | null | undefined,
  status: string | null | undefined,
): boolean {
  if (!rolle) return false
  if (status === 'abgeschlossen' || status === 'storniert') return false
  return rolle === 'admin' || rolle === 'kundenbetreuer' || rolle === 'sachverstaendiger'
}
