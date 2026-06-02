// P2d-1 (dispatch-config-unify): Welche lead-erfassung-Felder der Dispatcher
// REICHER sieht (Rich-Komponente statt generischem FieldRenderer). Pure, ohne
// Component-/Server-Imports -> unit-testbar (das .tsx-Renderer-Modul zieht
// SvDispatchPanel & Co. nach und ist im vitest-Env nicht leichtgewichtig).

export const DISPATCH_FIELD_OVERRIDE_KEYS = ['termin'] as const
export type DispatchOverrideKey = (typeof DISPATCH_FIELD_OVERRIDE_KEYS)[number]

export function hasDispatchFieldOverride(feldKey: string): boolean {
  return (DISPATCH_FIELD_OVERRIDE_KEYS as readonly string[]).includes(feldKey)
}
