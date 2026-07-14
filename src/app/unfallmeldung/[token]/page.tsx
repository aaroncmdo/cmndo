// Slice 2c — Bestaetigungs-Page fuer den Unfallgegner (Ziel des SMS-Magic-Links).
// PUBLIC: der Gegner hat keinen Account; der Token IST die Berechtigung (analog
// /schaden/[token] und /flow/[token]). Middleware-Whitelist: '/unfallmeldung'.
import { notFound } from 'next/navigation'
import { markiereInviteGeoeffnet, resolveInviteToken } from '@/lib/airdrop/gegner-invite'
import { ladeVsMeldungDaten } from '@/lib/vs-meldung/claim-daten'
import { BestaetigungClient } from './BestaetigungClient'

export const dynamic = 'force-dynamic'

export default async function UnfallmeldungBestaetigenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const ctx = await resolveInviteToken(token)
  if (!ctx) notFound()

  // Oeffnungs-Tracking (nur beim ersten Mal — chk_airdrop_responded_after_opened).
  await markiereInviteGeoeffnet(ctx.inviteId)

  const daten = await ladeVsMeldungDaten(ctx.claimId)

  return (
    <BestaetigungClient
      token={token}
      abgelaufen={ctx.abgelaufen}
      bereitsBestaetigt={ctx.bereitsBestaetigt}
      gegnerName={daten?.gegner.name ?? null}
      kennzeichen={daten?.gegner.kennzeichen ?? null}
      unfallDatum={daten?.unfallDatum ?? null}
      hergang={daten?.hergang ?? null}
    />
  )
}
