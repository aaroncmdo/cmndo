// AAR-428 / W4: Zentraler Permission-Layer für die Fallakte.
//
// Rollen-Gate für UI-Elemente (Buttons/Sections/Tabs). Die Source of Truth
// bleibt RLS + Server-Actions (die prüfen noch einmal). Dieser Layer ist
// UI-Hygiene — er sorgt dafür dass KB keine destruktiven Buttons sieht,
// obwohl RLS den Call ohnehin blockieren würde.
//
// Verwendung:
//   import { canPerform } from '@/app/admin/faelle/[id]/_lib/permissions'
//   {canPerform('canDeactivate', rolle) && <DeactivateButton />}
//
// Neue Aktionen: Flag hier in FALL_PERMISSIONS ergänzen, Rollen-Matrix
// definieren, Consumer mit canPerform() gaten.

import type { FallakteRolle } from '@/lib/fall/field-permissions'

export type FallAction =
  // Destruktive Actions — nur Admin
  | 'canDelete'
  | 'canDeactivate'
  | 'canReactivate'
  // Rollen-Zuweisung — nur Admin
  | 'canAssignRoles'
  // QC / Filmcheck — Admin only (KB nur lesen)
  | 'canPerformQc'
  | 'canRunFilmcheck'
  // Abrechnung — Admin only (KB nur lesen)
  | 'canEditAbrechnung'
  | 'canViewAbrechnung'
  // AI-Briefing — nur Admin regenerieren, alle lesen
  | 'canRegenerateBriefing'
  // VS-Regulierung
  | 'canEditVsRegulierung'
  // Dokumente
  | 'canUploadDokumente'
  | 'canViewDokumente'
  | 'canRequestDokumente'
  // Chat
  | 'canSendChat'
  | 'canViewChat'
  // Stammdaten
  | 'canEditStammdaten'

type PermissionMatrix = Record<FallAction, boolean>

// Admin = volle Rechte in der Admin-Fallakte
const ADMIN_PERMISSIONS: PermissionMatrix = {
  canDelete: true,
  canDeactivate: true,
  canReactivate: true,
  canAssignRoles: true,
  canPerformQc: true,
  canRunFilmcheck: true,
  canEditAbrechnung: true,
  canViewAbrechnung: true,
  canRegenerateBriefing: true,
  canEditVsRegulierung: true,
  canUploadDokumente: true,
  canViewDokumente: true,
  canRequestDokumente: true,
  canSendChat: true,
  canViewChat: true,
  canEditStammdaten: true,
}

// Kundenbetreuer = Daily-Driver für 95% der Fälle, aber keine destruktiven
// Actions, keine QC, keine Abrechnung.
const KB_PERMISSIONS: PermissionMatrix = {
  canDelete: false,
  canDeactivate: false,
  canReactivate: false,
  canAssignRoles: false,
  canPerformQc: false,
  canRunFilmcheck: false,
  canEditAbrechnung: false,
  canViewAbrechnung: false, // Abrechnung-Tab für KB ausblenden
  canRegenerateBriefing: false,
  canEditVsRegulierung: true, // VS-Kommunikation ist KB-Aufgabe
  canUploadDokumente: true,
  canViewDokumente: true,
  canRequestDokumente: true,
  canSendChat: true,
  canViewChat: true,
  canEditStammdaten: true,
}

// Dispatch nutzt eigenes Portal — sollte auf /admin/faelle nicht landen.
// Falls doch: read-only Sicht als Fallback.
const DISPATCH_PERMISSIONS: PermissionMatrix = {
  canDelete: false,
  canDeactivate: false,
  canReactivate: false,
  canAssignRoles: false,
  canPerformQc: false,
  canRunFilmcheck: false,
  canEditAbrechnung: false,
  canViewAbrechnung: false,
  canRegenerateBriefing: false,
  canEditVsRegulierung: false,
  canUploadDokumente: false,
  canViewDokumente: true,
  canRequestDokumente: false,
  canSendChat: false,
  canViewChat: true,
  canEditStammdaten: false,
}

// Sachverständige und Kunde haben keinen Admin-Fallakten-Zugang —
// Fallback = alles deny (kommen ohnehin via Middleware nicht hier an).
const READONLY_PERMISSIONS: PermissionMatrix = {
  canDelete: false,
  canDeactivate: false,
  canReactivate: false,
  canAssignRoles: false,
  canPerformQc: false,
  canRunFilmcheck: false,
  canEditAbrechnung: false,
  canViewAbrechnung: false,
  canRegenerateBriefing: false,
  canEditVsRegulierung: false,
  canUploadDokumente: false,
  canViewDokumente: true,
  canRequestDokumente: false,
  canSendChat: false,
  canViewChat: true,
  canEditStammdaten: false,
}

export const FALL_PERMISSIONS: Record<FallakteRolle, PermissionMatrix> = {
  admin: ADMIN_PERMISSIONS,
  kundenbetreuer: KB_PERMISSIONS,
  dispatch: DISPATCH_PERMISSIONS,
  sachverstaendiger: READONLY_PERMISSIONS,
  kunde: READONLY_PERMISSIONS,
}

/**
 * Prüft ob eine Rolle eine Fallakte-Aktion ausführen darf.
 * Fallback bei unbekannter Rolle: deny.
 */
export function canPerform(action: FallAction, rolle: FallakteRolle | null | undefined): boolean {
  if (!rolle) return false
  const matrix = FALL_PERMISSIONS[rolle]
  if (!matrix) return false
  return matrix[action] ?? false
}

/**
 * Ganze Permission-Matrix für eine Rolle — nützlich wenn der Context mehrere
 * Gates auf einmal auswerten soll.
 */
export function getPermissions(rolle: FallakteRolle | null | undefined): PermissionMatrix {
  if (!rolle) return READONLY_PERMISSIONS
  return FALL_PERMISSIONS[rolle] ?? READONLY_PERMISSIONS
}
