// Task 8: Server-Loader fuer ClaimAiPanel — laedt initialProposals + initialThread.
// Kein 'use client' — async Server-Component.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { listClaimProposals } from '@/lib/claim-ai/proposals'
import { loadThread } from '@/lib/claim-ai/threads'
import { ClaimAiPanel } from './ClaimAiPanel'

type Props = { fallId: string }

export async function ClaimAiPanelServer({ fallId }: Props) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()
    const claimId = await resolveClaimId(admin, fallId)
    if (!claimId) return null

    const [initialProposals, initialThread] = await Promise.all([
      listClaimProposals(claimId),
      loadThread(claimId, 'admin', user.id),
    ])

    return (
      <ClaimAiPanel
        fallId={fallId}
        initialProposals={initialProposals}
        initialThread={initialThread}
      />
    )
  } catch (err) {
    console.error('[ClaimAiPanelServer] Fehler beim Laden:', err)
    return null
  }
}
