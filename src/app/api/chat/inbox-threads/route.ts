import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChatThreads } from '@/lib/chat/inbox-reader'

// FAB-Badge-Counter (GlobalPosteingangFab) + global-chat-store. Seit P1 (01.06.2026)
// ein duenner Wrapper um den zentralen claim-keyed Reader getChatThreads().
// InboxThread-Shape bleibt (fall_id-keyed) — die FAB oeffnet Chats noch per fall_id
// (Transitions-Bridge; tiefer fall_id->claim_id-Cutover = CMM Track 2 §E).
export type InboxThread = {
  fallId: string
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
  kanaele: string[]
}

export async function GET() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ threads: [] }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  const rolle = profile?.rolle as string | undefined
  if (!rolle) return NextResponse.json({ threads: [] })

  // Kunde braucht Service-Role fuer getOwnedClaimIds (RLS-Bypass im Ownership-Lookup);
  // alle anderen Rollen lesen user-scoped (RLS via can_access_claim / admin_nachrichten).
  const db = rolle === 'kunde' ? createAdminClient() : supabase

  const chatThreads = await getChatThreads(db, {
    userId: user.id,
    rolle,
    email: user.email ?? null,
  })

  const threads: InboxThread[] = chatThreads
    .filter((t) => t.fallId) // FAB oeffnet per fall_id — Threads ohne fall_id (sollte es nicht geben) auslassen
    .map((t) => ({
      fallId: t.fallId as string,
      fallNummer: t.claimNummer,
      kundeName: t.kundeName,
      lastMessage: t.lastMessage,
      lastAt: t.lastAt,
      unreadCount: t.unreadCount,
      kanaele: t.kanaele,
    }))

  return NextResponse.json({ threads })
}
