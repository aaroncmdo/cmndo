// Partner-Tier-Badge (Bronze/Silber/Gold) — Ribbon-Pille + ehrliche Zeile.
//
// Der Rang kommt aus partner_rang (Phase 0, via getPartnerRang). Die Pille traegt
// die Tier-Farbe; die Zeile darunter zeigt den komponenten-ehrlichen Sinnsatz
// (nie eine nackte Fallzahl). Universeller Badge — Finder/Profil/nach Buchung/
// Community. Tier-Farben tragen Bedeutung und werden NICHT gebrandet.
import { Award } from 'lucide-react'
import { tokens } from '@/lib/design-tokens'
import type { Tier } from '@/lib/partner-rang/types'
import { tierLabel, tierDescriptors } from './partner-rang-badge.helpers'

type Props = {
  tier: Tier
  /** Komponenten-ehrlicher Sinnsatz aus partner_rang (optional). */
  sinnsatz?: string | null
  size?: 'sm' | 'md'
  /** Nur die Pille ohne Descriptor-Zeile (z.B. inline am Kommentar-Namen). */
  pillOnly?: boolean
}

export function PartnerRangBadge({ tier, sinnsatz, size = 'md', pillOnly = false }: Props) {
  const c = tokens.tierColors[tier]
  const descriptors = pillOnly ? '' : tierDescriptors(sinnsatz)
  const iconPx = size === 'sm' ? 11 : 13

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: tokens.radius.full,
          backgroundColor: c.soft,
          color: c.text,
          border: `1px solid color-mix(in srgb, ${c.accent} 32%, transparent)`,
          paddingLeft: 8,
          paddingRight: 9,
          height: size === 'sm' ? 18 : 22,
          fontSize: size === 'sm' ? 10 : 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        <Award style={{ width: iconPx, height: iconPx, color: c.accent }} strokeWidth={2.5} aria-hidden />
        {tierLabel(tier)}
      </span>
      {descriptors && (
        <span
          style={{
            fontSize: size === 'sm' ? 10 : 11,
            color: tokens.cssColors.navy,
            opacity: 0.72,
            lineHeight: 1.3,
          }}
        >
          {descriptors}
        </span>
      )}
    </span>
  )
}
