// PURE: nur Schema-Keys durchlassen (nie Rechts-/Auth-Felder), Pflicht-Luecken finden.
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

export function filterDeltas(
  deltas: Record<string, unknown>,
  schema: IntakeFeld[],
): Record<string, unknown> {
  const erlaubt = new Set(schema.map((f) => f.feld_key))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(deltas ?? {})) {
    if (erlaubt.has(k) && v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

export function fehlendePflicht(schema: IntakeFeld[], bekannt: Record<string, unknown>): string[] {
  return schema
    .filter((f) => f.pflicht)
    .filter((f) => {
      const v = bekannt[f.feld_key]
      return v === undefined || v === null || v === ''
    })
    .map((f) => f.feld_key)
}
