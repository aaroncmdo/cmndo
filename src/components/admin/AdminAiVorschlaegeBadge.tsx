'use client'

// Attention-Badge fuer den „KI-Vorschlaege"-Nav-Link: zeigt die Anzahl offener
// Orchestrator-Vorschlaege, damit Admins sie proaktiv reviewen (human-in-loop
// bleibt selbsttragend). ai_claim_proposals ist RLS-locked → der Count kommt
// ueber die admin-gegatete Server-Action, nicht ueber einen Client-Query.
// RealtimeCountBadge rendert nichts bei 0.

import { useCallback } from 'react'
import RealtimeCountBadge, { type RealtimeCountBadgeProps } from '@/components/shared/RealtimeCountBadge'
import { getOffeneVorschlaegeCount } from '@/app/admin/ai-vorschlaege/actions'

export function AdminAiVorschlaegeBadge({
  variant = 'counter',
  className,
}: {
  variant?: RealtimeCountBadgeProps['variant']
  className?: string
}) {
  const fetchCount = useCallback(() => getOffeneVorschlaegeCount(), [])
  return (
    <RealtimeCountBadge
      fetchCount={fetchCount}
      realtimeTable="ai_claim_proposals"
      variant={variant}
      className={className}
    />
  )
}
