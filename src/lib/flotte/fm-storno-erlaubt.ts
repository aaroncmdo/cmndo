// Nur frueh-stufige Schaeden (kein SV zugewiesen, keine Werkstatt committed) darf
// der Flottenmanager selbst stornieren; fortgeschrittene -> "Bitte Admin kontaktieren".
// Alle drei sind gueltige 'storniert'-Quellzustaende (state-machine.ts) UND liegen
// vor einer SV-Zuweisung. Initial-Status eines Schadenkarte-Claims = 'ersterfassung'
// (convertLeadToClaim ohne SV-Termin) -> ein frisch (versehentlich) angelegter Schaden
// ist stornierbar. Die Engine (transitionFallStatus) validiert den Uebergang zusaetzlich.
export const FM_STORNO_STATUS = ['ersterfassung', 'onboarding', 'sv-gesucht'] as const

export function fmDarfStornieren(status: string | null | undefined): boolean {
  return !!status && (FM_STORNO_STATUS as readonly string[]).includes(status)
}
