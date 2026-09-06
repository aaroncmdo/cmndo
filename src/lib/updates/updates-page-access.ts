// Phase 5 Teil D: Zugriff auf die /updates-Vollseite.
// Operative Rollen bekommen die Worklist (echte "Braucht Sie"-Listen);
// Kunde/makler bleiben beim Popover -> die Vollseite redirected sie auf ihr Portal.

const OPERATIVE_ROLES = new Set<string>([
  'admin',
  'dispatch',
  'leadbearbeiter', // toter Enum-Wert = Dispatcher-Alias (nie fragmentieren)
  'sachverstaendiger',
  'kundenbetreuer',
  'kanzlei',
  'werkstatt',
])

export function isOperativeUpdatesRole(rolle: string | null | undefined): boolean {
  return !!rolle && OPERATIVE_ROLES.has(rolle)
}
