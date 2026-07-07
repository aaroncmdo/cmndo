import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClaimChatPanel } from '@/components/chat/ClaimChatPanel'

// Pilot-Route (Phase 2c): Claim-Chat auf dem neuen Thread-Modell (Gruppe/Team-intern/DMs). Admin-only.
// Bewusst eine NEUE, eigene Route (null Kollision mit den bestehenden Chat-Portalen) — der Cutover
// (MultiChannelChat -> ClaimChatPanel) folgt portalweise + koordiniert, sobald das Modell erprobt ist.
export default async function AdminClaimChatPilotPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col p-4">
      <h1 className="shrink-0 text-heading-md font-bold text-claimondo-navy">Claim-Chat — Thread-Modell (Pilot)</h1>
      <p className="mb-3 shrink-0 text-body-xs text-claimondo-ondo">
        Neues Gruppe/DM-Modell. Claim: <span className="font-mono">{claimId}</span>
      </p>
      <div className="min-h-0 flex-1 overflow-hidden rounded-ios-lg border border-claimondo-border bg-white">
        <ClaimChatPanel claimId={claimId} currentUserId={user.id} />
      </div>
    </div>
  )
}
