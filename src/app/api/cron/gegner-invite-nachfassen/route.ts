// Slice 2c — Auffangnetz: Der Unfallgegner hat den SMS-Bestaetigungs-Link nicht angetippt.
// Ohne Bestaetigung geht KEINE Meldung an seine Haftpflicht (Fraud-Gate) — ohne diesen Cron
// wuerde der Claim also still liegenbleiben. Nach 48 h uebernimmt ein Mensch.
// erstelleVsDispatchTask dedupliziert per task_code -> mehrfache Laeufe sind sicher.
//
// Schedule (VPS-crontab, NICHT vercel.json — das existiert in diesem Repo nicht):
//   0 7 * * *  cron-call.sh /api/cron/gegner-invite-nachfassen
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { erstelleVsDispatchTask } from '@/lib/vs-meldung/dispatch-task'

export const dynamic = 'force-dynamic'

const FRIST_STUNDEN = 48

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const grenze = new Date(Date.now() - FRIST_STUNDEN * 60 * 60_000).toISOString()

  const { data, error } = await admin
    .from('airdrop_invitations')
    .select('id, claim_id')
    .in('status', ['offen', 'geoeffnet'])
    .is('responded_at', null)
    .lt('invited_at', grenze)

  if (error) {
    console.error('[cron/gegner-invite-nachfassen] Query fehlgeschlagen:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const invites = (data ?? []) as Array<{ id: string; claim_id: string }>
  let eskaliert = 0

  for (const inv of invites) {
    try {
      await erstelleVsDispatchTask({
        claimId: inv.claim_id,
        grund: 'nicht_bestaetigt',
        detail: `Einladung seit über ${FRIST_STUNDEN} Stunden unbestätigt.`,
      })
      // Status fortschreiben, damit der naechste Lauf denselben Invite nicht erneut
      // aufgreift (der Task selbst ist per task_code ohnehin dedupliziert).
      await admin
        .from('airdrop_invitations')
        .update({ status: 'abgelaufen', abgelaufen_am: new Date().toISOString() })
        .eq('id', inv.id)
      eskaliert++
    } catch (err) {
      // Fehler pro Item -> weiter, nie throw (Cron-Hausmuster, s. vs-korrespondenz-review)
      console.error('[cron/gegner-invite-nachfassen] Invite', inv.id, 'fehlgeschlagen:', err)
      continue
    }
  }

  return NextResponse.json({ geprueft: invites.length, eskaliert })
}
