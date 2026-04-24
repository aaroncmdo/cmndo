// AAR-752: Permission-Matrix pro Rolle.
//
// Eine Quelle der Wahrheit für "was darf Rolle X". Alte Funktionen
// (canPerform, canEditField, getVisibleFallSections) delegieren gegen
// diese Matrix via Helpers. Neue Consumer importieren direkt.

import type { UserRolle } from '@/lib/auth/guards'
import type { Permission, PermissionCapability } from './types'

// SV-Stammdaten-Whitelist: Felder die ein Sachverständiger editieren darf.
// Prefix-Pattern mit trailing `*` match alle Felder die damit beginnen
// (ersetzt das alte SV_EDITABLE_PREFIXES aus field-permissions.ts).
const SV_STAMMDATEN_FIELDS: readonly string[] = [
  'fahrzeug_*',
  'besichtigungsort_*',
  'gutachten_*',
  'kernwert_*',
  'schadens_*',
  'foto_*',
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
]

const ADMIN_CAPS = new Set<PermissionCapability>([
  'fall.override_status',
  'fall.override_phase',
  'fall.reassign_sv',
  'fall.delete',
  'fall.deactivate',
  'briefing.regenerate',
  'dokumente.request',
  'dokumente.qc',
  'dokumente.filmcheck',
  'tasks.create_for_other',
  'tasks.delegate',
  'tasks.view_team',
  'stammdaten.edit_kanzlei_felder',
  'abrechnung.approve',
  'vs_regulierung.edit',
  'rollen.assign',
])

const KB_CAPS = new Set<PermissionCapability>([
  // KB ist Daily-Driver aber ohne destruktive Actions und ohne Abrechnung-Approve
  'dokumente.request',
  'tasks.create_for_other',
  'tasks.view_team',
  'stammdaten.edit_kanzlei_felder',
  'vs_regulierung.edit',
])

const DISPATCH_CAPS = new Set<PermissionCapability>([
  // Dispatch bearbeitet Leads; wenn sie auf Fälle treffen primär read-only
  'tasks.create_for_other',
  'tasks.view_team',
])

/**
 * Die Matrix — pro UserRolle eine komplette Permission-Definition.
 */
export const PERMISSION_MATRIX: Record<UserRolle, Permission> = {
  admin: {
    scope: 'all',
    resources: {
      fall: 'write',
      stammdaten: 'write',
      abrechnung: 'write',
      dokumente: 'write',
      chat: 'write',
      tasks: 'write',
      prozess: 'write',
    },
    capabilities: ADMIN_CAPS,
    // undefined = alle Felder editierbar
  },

  kundenbetreuer: {
    scope: 'assigned',
    resources: {
      fall: 'write',
      stammdaten: 'write',
      abrechnung: 'none',       // KB sieht Abrechnung-Tab nicht
      dokumente: 'write',
      chat: 'write',
      tasks: 'write',
      prozess: 'write',
    },
    capabilities: KB_CAPS,
  },

  dispatch: {
    scope: 'all',                 // Dispatch sieht alle Leads + Fälle
    resources: {
      fall: 'read',               // Fälle read-only
      stammdaten: 'read',
      abrechnung: 'none',
      dokumente: 'read',
      // Chat read-only in der Admin-Fallakte-Sicht (Dispatch ist nach
      // Fall-Erstellung nicht mehr zuständig). Im Dispatch-Portal
      // während der Lead-Phase läuft der Chat über eine andere
      // Permission-Semantik (Lead != Fall).
      chat: 'read',
      tasks: 'write',
      prozess: 'read',
    },
    capabilities: DISPATCH_CAPS,
  },

  sachverstaendiger: {
    scope: 'own',                 // Nur eigene Fälle via sv_id
    resources: {
      fall: 'read',
      stammdaten: 'write',        // Mit Feld-Whitelist eingeschränkt
      abrechnung: 'read',         // Eigene Abrechnung sehen
      dokumente: 'write',         // Upload von Gutachten etc.
      chat: 'write',
      tasks: 'write',             // Nur eigene Tasks
      prozess: 'read',
    },
    capabilities: new Set<PermissionCapability>([]),
    stammdaten_fields: SV_STAMMDATEN_FIELDS,
  },

  kunde: {
    scope: 'own',
    resources: {
      fall: 'read',
      stammdaten: 'read',
      abrechnung: 'none',
      dokumente: 'read',          // Upload separat über Upload-Token-Route
      chat: 'write',
      tasks: 'none',
      prozess: 'read',
    },
    capabilities: new Set<PermissionCapability>([]),
  },

  kanzlei: {
    scope: 'assigned',            // Nur Fälle mit kanzlei_id + komplett-Service
    resources: {
      fall: 'read',
      stammdaten: 'read',
      abrechnung: 'read',         // Kanzlei darf Abrechnung einsehen
      dokumente: 'read',
      chat: 'read',
      tasks: 'none',
      prozess: 'read',
    },
    capabilities: new Set<PermissionCapability>([]),
  },

  makler: {
    scope: 'makler_kunden',       // Nur eigene Versicherungskunden
    resources: {
      fall: 'read',
      stammdaten: 'read',
      abrechnung: 'read',         // Makler sieht seine Provision
      dokumente: 'read',
      chat: 'write',              // Chat mit Kunde
      tasks: 'none',
      prozess: 'read',
    },
    capabilities: new Set<PermissionCapability>([]),
  },
}

/**
 * Fallback-Permission für unbekannte/null-Rollen. Alles deny.
 */
export const DENY_ALL_PERMISSION: Permission = {
  scope: 'none',
  resources: {
    fall: 'none',
    stammdaten: 'none',
    abrechnung: 'none',
    dokumente: 'none',
    chat: 'none',
    tasks: 'none',
    prozess: 'none',
  },
  capabilities: new Set<PermissionCapability>([]),
}
