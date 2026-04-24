// AAR-161 / W1: Fallakte Field-Permissions — Rolle → editierbare Felder.
// AAR-752: On die neue zentrale Permission-Matrix (lib/permissions)
// umgeleitet. Dieser File ist @deprecated Wrapper — Consumer sollen
// nach und nach auf `@/lib/permissions` umstellen.

import {
  canEditField as canEditFieldNew,
  hasAnyEditPermission as hasAnyEditPermissionNew,
  SYSTEM_FIELDS as SYSTEM_FIELDS_NEW,
} from '@/lib/permissions'

export type FallakteRolle =
  | 'admin'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'kunde'
  | 'dispatch'
  | 'kanzlei'
  | 'makler'

/**
 * @deprecated AAR-752: System-Felder-Liste jetzt in `@/lib/permissions`.
 * Re-Export für bestehende Consumer, Löschung wenn alle migriert sind.
 */
export const SYSTEM_FIELDS = SYSTEM_FIELDS_NEW

/**
 * @deprecated AAR-752: nutze `canEditField` aus `@/lib/permissions`.
 * Wrapper delegiert 1:1.
 */
export function canEditField(
  rolle: FallakteRolle | string | null | undefined,
  field: string,
  status: string | null | undefined,
): boolean {
  return canEditFieldNew(rolle, field, status)
}

/**
 * @deprecated AAR-752: nutze `hasAnyEditPermission` aus `@/lib/permissions`.
 */
export function hasAnyEditPermission(
  rolle: FallakteRolle | string | null | undefined,
  status: string | null | undefined,
): boolean {
  return hasAnyEditPermissionNew(rolle, status)
}
