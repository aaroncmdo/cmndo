// AAR-752: Public API des Permission-Layers.
//
// Call-Sites importieren:
//   import { can, canRead, canWrite, canEditField, getPermission } from '@/lib/permissions'
//
// Die interne Matrix (matrix.ts) wird bewusst NICHT exportiert — Änderungen
// laufen über diese File, damit die Änderung einer Rollen-Permission eine
// bewusste Edit ist und nicht irgendwo im Consumer passiert.

export type {
  Permission,
  PermissionCapability,
  PermissionLevel,
  PermissionResource,
  PermissionScope,
} from './types'

export { SYSTEM_FIELDS } from './types'

export {
  can,
  canEditField,
  canRead,
  canWrite,
  getPermission,
  hasAnyEditPermission,
  level,
} from './helpers'
