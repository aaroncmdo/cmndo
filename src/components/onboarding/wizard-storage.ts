// localStorage-Key des Wizard-Zustands (AAR-890). Pure Utility, damit die
// Key-Bildung unit-testbar ist und WizardClient sie nur konsumiert.

const STORAGE_PREFIX = 'claimondo-wizard-state'

// Mit fallId wird der Zustand fall-scoped gespeichert — sonst restauriert der
// Wizard bei Mehrfall-Kunden den zuletzt bearbeiteten (falschen) Fall
// (Bug3-Smoke-Nebenbefund 28.07.). Ohne fallId (sv-onboarding, gutachter-finden)
// bleibt der bisherige Key unveraendert.
export function wizardStorageKey(flowKey: string, fallId?: string | null): string {
  return fallId ? `${STORAGE_PREFIX}:${flowKey}:${fallId}` : `${STORAGE_PREFIX}:${flowKey}`
}
