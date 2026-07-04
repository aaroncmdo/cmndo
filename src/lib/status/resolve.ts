// src/lib/status/resolve.ts
import type { DomainName, StatusDef, ViewerRole } from './types'
import { DOMAINS } from './registry'
import { statusSlotClass } from './slots'

export function resolveStatus(domain: DomainName, code: string | null | undefined): StatusDef {
  const hit = code ? DOMAINS[domain]?.[code] : undefined
  if (hit) return hit
  return { label: code && code.length > 0 ? code : '—', slot: 'neutral' }
}

export function statusLabel(
  domain: DomainName,
  code: string | null | undefined,
  role?: ViewerRole,
): string {
  const def = resolveStatus(domain, code)
  if (role && def.labelByRole?.[role]) return def.labelByRole[role] as string
  return def.label
}

export function statusBadgeView(
  domain: DomainName,
  code: string | null | undefined,
  role?: ViewerRole,
): { label: string; slotClass: string; iconKey?: string } {
  const def = resolveStatus(domain, code)
  return {
    label: role && def.labelByRole?.[role] ? (def.labelByRole[role] as string) : def.label,
    slotClass: statusSlotClass(def.slot),
    iconKey: def.iconKey,
  }
}

export function isKnownStatus(domain: DomainName, code: string | null | undefined): boolean {
  return !!(code && DOMAINS[domain]?.[code])
}
