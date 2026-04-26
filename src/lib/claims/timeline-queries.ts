// AAR-843: Server-Query für die Timeline-View v_claim_timeline.

import { createClient } from '@/lib/supabase/server'

export type ViewerRole = 'admin' | 'kb' | 'sv' | 'kunde'

export type ClaimTimelineEvent = {
  event_id: string
  claim_id: string
  fall_id: string | null
  event_at: string
  event_typ: string
  event_kategorie: string
  actor_user_id: string | null
  actor_rolle: string
  payload_jsonb: Record<string, unknown>
  sichtbar_fuer_kunde: boolean
  sichtbar_fuer_sv: boolean
  detail_url_path: string | null
}

/**
 * Lädt die komplette Timeline für einen Claim. RLS auf der View greift durch
 * (security_invoker=on). Zusätzlicher Sichtbarkeits-Filter pro Event basierend
 * auf der viewerRole (Defense in Depth).
 */
export async function getClaimTimeline(
  claimId: string,
  viewerRole: ViewerRole,
): Promise<ClaimTimelineEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_claim_timeline')
    .select('*')
    .eq('claim_id', claimId)
    .order('event_at', { ascending: false })

  if (error) {
    console.error('[AAR-843] getClaimTimeline:', error.message)
    return []
  }

  const rows = (data ?? []) as ClaimTimelineEvent[]

  // Per-Event-Filter (Defense in Depth — RLS deckt schon Per-Claim, hier nur
  // sichtbar_fuer_kunde/sv-Flags pro Event).
  return rows.filter((event) => {
    if (viewerRole === 'admin' || viewerRole === 'kb') return true
    if (viewerRole === 'kunde') return event.sichtbar_fuer_kunde
    if (viewerRole === 'sv')    return event.sichtbar_fuer_sv
    return false
  })
}

export async function getClaimTimelineCompact(
  claimId: string,
  viewerRole: ViewerRole,
  limit = 5,
): Promise<ClaimTimelineEvent[]> {
  const all = await getClaimTimeline(claimId, viewerRole)
  return all.slice(0, limit)
}
