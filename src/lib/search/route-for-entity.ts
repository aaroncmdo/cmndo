import type { EntityType } from './types'

// Rollen-bewusste Detail-Route fuer einen Such-Treffer.
// Spiegelt routeForKontext (src/lib/updates/split.ts) — Claims sind rollen-abhaengig,
// Leads gehen ins Dispatch-Portal. Fahrzeug-/Person-Treffer kommen als entity_type='claim'
// (surfen als ihr Fall), daher hier nur 'claim' und 'lead'.
export function routeForEntity(entityType: EntityType, id: string, rolle: string): string | null {
  if (!id) return null
  if (entityType === 'claim') {
    switch (rolle) {
      case 'kunde':
        return `/kunde/faelle/${id}`
      case 'sachverstaendiger':
        return `/gutachter/fall/${id}`
      case 'makler':
        return `/makler/akten/${id}`
      default:
        // admin/dispatch/kundenbetreuer/leadbearbeiter/kanzlei/werkstatt/flottenmanager
        return `/faelle/${id}`
    }
  }
  if (entityType === 'lead') return `/dispatch/leads/${id}`
  return null
}
