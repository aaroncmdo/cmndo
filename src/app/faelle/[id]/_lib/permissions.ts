// AAR-428 / W4: Zentraler Permission-Layer für die Fallakte.
// AAR-752: Auf die neue Matrix (`@/lib/permissions`) umgeleitet. Dieser
// File ist @deprecated Wrapper — `canPerform('canDelete', rolle)` wird
// auf `can(rolle, 'fall.delete')` bzw. `canWrite(rolle, 'abrechnung')`
// gemappt. Neue Consumer sollen direkt das neue API nutzen.

import type { FallakteRolle } from '@/lib/fall/field-permissions'
import { can, canRead, canWrite } from '@/lib/permissions'
import type { PermissionCapability } from '@/lib/permissions'

export type FallAction =
  | 'canDelete'
  | 'canDeactivate'
  | 'canReactivate'
  | 'canAssignRoles'
  | 'canPerformQc'
  | 'canRunFilmcheck'
  | 'canEditAbrechnung'
  | 'canViewAbrechnung'
  | 'canRegenerateBriefing'
  | 'canEditVsRegulierung'
  | 'canUploadDokumente'
  | 'canViewDokumente'
  | 'canRequestDokumente'
  | 'canSendChat'
  | 'canViewChat'
  | 'canEditStammdaten'

// AAR-752: Action → neues Matrix-Check-Funktions-Mapping.
// Jede Action deligiert an Resource-R/W oder eine Capability.
const ACTION_TO_CAPABILITY: Partial<Record<FallAction, PermissionCapability>> = {
  canDelete: 'fall.delete',
  canDeactivate: 'fall.deactivate',
  canReactivate: 'fall.deactivate',
  canAssignRoles: 'rollen.assign',
  canPerformQc: 'dokumente.qc',
  canRunFilmcheck: 'dokumente.filmcheck',
  canRegenerateBriefing: 'briefing.regenerate',
  canEditVsRegulierung: 'vs_regulierung.edit',
  canRequestDokumente: 'dokumente.request',
}

/**
 * @deprecated AAR-752: nutze `can(rolle, 'capability')` oder
 * `canWrite(rolle, 'resource')` aus `@/lib/permissions`. Dieser Wrapper
 * delegiert an die neue Matrix und bleibt bestehen damit Consumer
 * schrittweise migrieren können.
 */
export function canPerform(
  action: FallAction,
  rolle: FallakteRolle | null | undefined,
): boolean {
  if (!rolle) return false

  // Resource-R/W-Mappings (keine Capability nötig)
  switch (action) {
    case 'canEditAbrechnung':
      return canWrite(rolle, 'abrechnung')
    case 'canViewAbrechnung':
      return canRead(rolle, 'abrechnung')
    case 'canUploadDokumente':
      return canWrite(rolle, 'dokumente')
    case 'canViewDokumente':
      return canRead(rolle, 'dokumente')
    case 'canSendChat':
      return canWrite(rolle, 'chat')
    case 'canViewChat':
      return canRead(rolle, 'chat')
    case 'canEditStammdaten':
      return canWrite(rolle, 'stammdaten')
  }

  // Capability-Mappings
  const cap = ACTION_TO_CAPABILITY[action]
  if (cap) return can(rolle, cap)

  return false
}

/**
 * @deprecated AAR-752: nutze das neue `@/lib/permissions`-API direkt.
 * Nur noch für Legacy-Consumer die die Action-Namen als Strings nutzen.
 */
export function getPermissions(
  rolle: FallakteRolle | null | undefined,
): Record<FallAction, boolean> {
  const actions: FallAction[] = [
    'canDelete', 'canDeactivate', 'canReactivate', 'canAssignRoles',
    'canPerformQc', 'canRunFilmcheck', 'canEditAbrechnung',
    'canViewAbrechnung', 'canRegenerateBriefing', 'canEditVsRegulierung',
    'canUploadDokumente', 'canViewDokumente', 'canRequestDokumente',
    'canSendChat', 'canViewChat', 'canEditStammdaten',
  ]
  return actions.reduce((acc, a) => {
    acc[a] = canPerform(a, rolle)
    return acc
  }, {} as Record<FallAction, boolean>)
}
