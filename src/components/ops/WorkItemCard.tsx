'use client'
// Wiederverwendbare Work-Item-Karte (KB-Board + Admin-Cockpit): kompakte Karte mit
// Titel/Kennzeichen/optionalem Owner/Phase-Badge/naechster-Aktion/Ueberfaellig-Marker,
// mit group-hover -> ClaimHoverCard (Inline-Edit + Phasen-Override). Farbe via FallPhaseBadge
// (Registry), Karte via primitives.Card. Keine inline Status-/Farb-Maps.

import Link from 'next/link'
import { CLAIM_WORKFLOW_META } from '@/lib/ops/claim-workflow-meta'
import FallPhaseBadge from '@/components/shared/FallPhaseBadge'
import { Card } from '@/components/primitives'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'
import ClaimHoverCard from '@/components/mitarbeiter/ClaimHoverCard'

export default function WorkItemCard({
  item,
  ownerName,
}: {
  item: ClaimWorkItem
  /** Owner-Name (Admin-Kontext) — im KB-Board weggelassen (eigene Faelle). */
  ownerName?: string
}) {
  const href = item.fallId ? `/faelle/${item.fallId}` : null
  const meta = CLAIM_WORKFLOW_META[item.subState]

  const inner = (
    <Card p={3} className="hover:border-claimondo-ondo hover:shadow-sm transition-all">
      <p className="text-body-sm font-semibold text-claimondo-navy truncate">{item.display.title}</p>
      {(item.display.kennzeichen || ownerName) && (
        <div className="mt-0.5 flex items-center gap-2 min-w-0">
          {item.display.kennzeichen && (
            <span className="text-caption font-mono text-claimondo-ondo shrink-0">{item.display.kennzeichen}</span>
          )}
          {ownerName && (
            <span className="text-caption text-claimondo-ondo/70 truncate">· {ownerName}</span>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <FallPhaseBadge subPhase={item.subState} size="sm" />
        <span className="text-caption px-1.5 py-0.5 rounded-ios-sm bg-claimondo-bg text-claimondo-ondo border border-claimondo-border">
          {meta.ctaLabel}
        </span>
      </div>

      {item.isOverdue && item.overdueSinceDays != null && (
        <p className="mt-2 text-caption font-medium bg-warning-soft text-warning-strong rounded-ios-sm px-1.5 py-0.5 inline-block">
          ⏱ {item.overdueSinceDays} {item.overdueSinceDays === 1 ? 'Tag' : 'Tage'} überfällig
        </p>
      )}
    </Card>
  )

  // Wrapper: group relative so the hover popover sits absolutely below the card.
  // Hover is a SIBLING of the Link (not inside it) -> clicking edit inputs never navigates.
  return (
    <div className="relative group">
      {href ? (
        <Link href={href} className="block">
          {inner}
        </Link>
      ) : (
        <div>{inner}</div>
      )}
      <div className="hidden group-hover:block absolute top-full left-0 z-50 pt-1">
        <ClaimHoverCard item={item} />
      </div>
    </div>
  )
}
