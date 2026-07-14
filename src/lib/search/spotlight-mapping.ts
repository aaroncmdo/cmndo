import { FileTextIcon, UserIcon, type LucideIcon } from 'lucide-react'
import type { SpotlightGroup } from '@/components/shared/Spotlight'
import type { SearchGroup, EntityType } from './types'

// Pure Mapping: search_global-Gruppen -> Spotlight-Gruppen (Icon/Label/Farbe je Entitaet).
// Icon-Farben = claimondo-Tokens (kein rohes Status-Gruen -> Token-Ratchet-safe).
const GROUP_META: Record<EntityType, { label: string; icon: LucideIcon; iconColor: string; hoverBg: string }> = {
  claim: { label: 'Fälle', icon: FileTextIcon, iconColor: 'text-claimondo-ondo', hoverBg: 'hover:bg-claimondo-ondo/5' },
  lead: { label: 'Leads', icon: UserIcon, iconColor: 'text-claimondo-navy', hoverBg: 'hover:bg-claimondo-navy/[0.05]' },
}

export function mapGroupsToSpotlight(groups: SearchGroup[]): SpotlightGroup[] {
  return groups.map((g) => {
    const meta = GROUP_META[g.entityType]
    return {
      key: g.entityType,
      label: meta.label,
      icon: meta.icon,
      iconColor: meta.iconColor,
      hoverBg: meta.hoverBg,
      results: g.hits.map((h) => ({
        id: h.id,
        label: h.label,
        sub: h.sub ?? undefined,
        status: h.status ?? undefined,
      })),
    }
  })
}
