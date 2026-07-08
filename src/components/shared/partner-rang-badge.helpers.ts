// Reine Helfer fuer PartnerRangBadge — ohne React/lucide, damit node-env-testbar.
import type { Tier } from '@/lib/partner-rang/types'

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze-Partner',
  silber: 'Silber-Partner',
  gold: 'Gold-Partner',
}

export function tierLabel(tier: Tier): string {
  return TIER_LABEL[tier]
}

/**
 * Descriptor-Zeile aus dem Sinnsatz: alles NACH dem fuehrenden "<Tier>-Partner"-
 * Label (das die Pille schon zeigt). Der Sinnsatz ist komponenten-ehrlich und
 * enthaelt nie eine nackte Fallzahl (Phase-0-Garantie).
 */
export function tierDescriptors(sinnsatz: string | null | undefined): string {
  if (!sinnsatz) return ''
  const teile = sinnsatz.split(' · ')
  return teile.length > 1 ? teile.slice(1).join(' · ') : ''
}
