// AAR-752: Helper-Funktionen zum Abfragen der Permission-Matrix.
//
// Ein Call-Site importiert typischerweise `getPermission(rolle)` oder
// `canRead(rolle, 'abrechnung')` — ohne das interne Matrix-Objekt zu
// kennen.

import type { UserRolle } from '@/lib/auth/guards'
import type {
  Permission,
  PermissionCapability,
  PermissionLevel,
  PermissionResource,
} from './types'
import { SYSTEM_FIELDS } from './types'
import { DENY_ALL_PERMISSION, PERMISSION_MATRIX } from './matrix'

/**
 * Liefert die komplette Permission einer Rolle. Fallback bei unbekannter
 * Rolle: deny-all.
 */
export function getPermission(
  rolle: UserRolle | string | null | undefined,
): Permission {
  if (!rolle) return DENY_ALL_PERMISSION
  const entry = PERMISSION_MATRIX[rolle as UserRolle]
  return entry ?? DENY_ALL_PERMISSION
}

/**
 * Read-Check auf Resource-Ebene. True wenn `resources[resource]` != 'none'.
 */
export function canRead(
  rolle: UserRolle | string | null | undefined,
  resource: PermissionResource,
): boolean {
  return getPermission(rolle).resources[resource] !== 'none'
}

/**
 * Write-Check auf Resource-Ebene. True wenn `resources[resource]` === 'write'.
 */
export function canWrite(
  rolle: UserRolle | string | null | undefined,
  resource: PermissionResource,
): boolean {
  return getPermission(rolle).resources[resource] === 'write'
}

/**
 * Capability-Check. Für feingranulare Feature-Flags.
 *
 * @example
 *   if (can(rolle, 'briefing.regenerate')) { ... }
 */
export function can(
  rolle: UserRolle | string | null | undefined,
  capability: PermissionCapability,
): boolean {
  return getPermission(rolle).capabilities.has(capability)
}

/**
 * Resource-Level-Query (eine Stelle wo die Matrix raw gelesen wird).
 */
export function level(
  rolle: UserRolle | string | null | undefined,
  resource: PermissionResource,
): PermissionLevel {
  return getPermission(rolle).resources[resource]
}

/**
 * Feld-Edit-Check für Stammdaten. Kombiniert:
 *   - System-Felder (niemals)
 *   - Fall-Status (abgeschlossen / storniert → read-only)
 *   - Resource-Level (braucht 'write')
 *   - Feld-Whitelist (wenn die Rolle eine hat)
 *
 * Ersetzt die alte `canEditField` aus `lib/fall/field-permissions.ts`.
 */
export function canEditField(
  rolle: UserRolle | string | null | undefined,
  field: string,
  status: string | null | undefined,
): boolean {
  if (!rolle) return false
  if (SYSTEM_FIELDS.has(field)) return false
  if (status === 'abgeschlossen' || status === 'storniert') return false

  const perm = getPermission(rolle)
  if (perm.resources.stammdaten !== 'write') return false

  // Keine Whitelist = alle Felder (Admin/KB)
  if (!perm.stammdaten_fields || perm.stammdaten_fields.length === 0) {
    return true
  }

  // Exact oder Prefix-Match (`fahrzeug_*`)
  return perm.stammdaten_fields.some((pattern) => {
    if (pattern.endsWith('*')) {
      return field.startsWith(pattern.slice(0, -1))
    }
    return field === pattern
  })
}

/**
 * Convenience-Flag: Hat die Rolle überhaupt IRGENDWO Stammdaten-Edit?
 * Für UI-Gate „Edit-Mode global verfügbar".
 */
export function hasAnyEditPermission(
  rolle: UserRolle | string | null | undefined,
  status: string | null | undefined,
): boolean {
  if (!rolle) return false
  if (status === 'abgeschlossen' || status === 'storniert') return false
  return getPermission(rolle).resources.stammdaten === 'write'
}
