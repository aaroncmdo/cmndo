// AAR-487 (M5): Makler-Akte-Detail — Server-Entry. Lädt den Fall + alle
// benötigten Relationen, signed URLs für Dokumente. Consent-Gate:
// Minimal-Consent → Redirect zur Akten-Liste mit Hinweis-Param.

import { notFound, redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerFallDetail,
  getFallChat,
  getFallGruppeThreadId,
} from '@/lib/makler/queries'
import { createClient } from '@/lib/supabase/server'
import { MaklerAkteDetail } from '@/components/makler/akte-detail/MaklerAkteDetail'

export const dynamic = 'force-dynamic'

// C4/§9-#7: `searchParams` entfaellt — den aktiven Tab liest der FallAkte-Kern selbst aus
// `?tab=`. Ihn hier zusaetzlich serverseitig zu lesen und durchzureichen waere eine zweite
// Wahrheit ueber denselben Zustand.
type Props = {
  params: Promise<{ id: string }>
}

export default async function MaklerAkteDetailPage({ params }: Props) {
  const { id } = await params

  const makler = await getCurrentMakler()
  if (!makler) return null

  const detail = await getMaklerFallDetail(makler.id, id)
  if (!detail) notFound()

  if (detail.consent_scope !== 'vollzugriff') {
    redirect(`/makler/akten?consent=minimal&fall=${id}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const chatMessages = await getFallChat(id)
  const gruppeThreadId = await getFallGruppeThreadId(id)

  return (
    <MaklerAkteDetail
      detail={detail}
      makler={makler}
      currentUserId={user?.id ?? ''}
      initialChatMessages={chatMessages}
      gruppeThreadId={gruppeThreadId}
    />
  )
}
