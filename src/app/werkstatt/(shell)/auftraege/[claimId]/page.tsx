// Werkstatt-Auftrag — Detailseite (D). Echte Server-Component (KEIN redirect-Stub,
// s. RSC-redirect-Antipattern). Zugriff via v_werkstatt_auftrag (RLS is_werkstatt_for_claim):
// ein Fremd-Auftrag liefert null -> notFound() (kein IDOR).

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getWerkstattByUserId,
  getWerkstattAuftrag,
  getWerkstattAuftragExtra,
  getWerkstattFallChat,
} from '@/lib/werkstatt/queries'
import { WerkstattAuftragDetail } from '@/components/werkstatt/WerkstattAuftragDetail'

export const dynamic = 'force-dynamic'

export default async function WerkstattAuftragDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  const { claimId } = await params

  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const auftrag = await getWerkstattAuftrag(claimId)
  if (!auftrag) notFound()

  // Zusatz-Kontext (Fahrzeug-Detail / Vorschaeden / Ansprechpartner) + Fall-Chat
  // NACH dem RLS-Gate oben (auftrag != null == Fall-Zugehoerigkeit bewiesen), via
  // Admin-Client (Defense-in-Depth).
  const supabase = await createClient()
  const [extra, chat, userRes] = await Promise.all([
    getWerkstattAuftragExtra(claimId),
    getWerkstattFallChat(claimId),
    supabase.auth.getUser(),
  ])
  const currentUserId = userRes.data.user?.id ?? null

  return (
    <WerkstattAuftragDetail
      auftrag={auftrag}
      extra={extra}
      chatMessages={chat.messages}
      chatRealtime={{ fallId: chat.fallId, gruppeThreadId: chat.gruppeThreadId }}
      currentUserId={currentUserId}
    />
  )
}
