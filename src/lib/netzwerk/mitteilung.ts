// In-App-Benachrichtigung ueber die ECHTE Glocke (mitteilungen) — NICHT benachrichtigungen (tote Tabelle).
// kategorie MUSS 'update' sein (DB-CHECK: update/task/nachricht/anruf). Best-effort: Caller wrappt zusaetzlich try/catch.
// C-Migration: C3 ersetzt das durch ein user-scoped Event (fan-out-Branch vor dem Claim-Gate) fuer Multi-Kanal.
import { createAdminClient } from '@/lib/supabase/admin'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'
import type { EmpfaengerRolle } from '@/lib/mitteilungen/types'
import type { NetzwerkRolle } from './types'

const ROLLE_TO_PORTAL: Record<NetzwerkRolle, string> = {
  sachverstaendiger: 'gutachter',
  werkstatt: 'werkstatt',
  flottenmanager: 'flotte',
  makler: 'makler',
}

export async function notifiziereNetzwerk(
  empfaengerProfilId: string,
  absender: { profilId: string; name: string },
  art: 'anfrage' | 'angenommen',
): Promise<void> {
  const admin = createAdminClient()
  const { data: prof } = await admin.from('profiles').select('rolle').eq('id', empfaengerProfilId).maybeSingle()
  const rolle = (prof?.rolle as NetzwerkRolle | undefined) ?? ('kunde' as NetzwerkRolle)
  const portal = ROLLE_TO_PORTAL[rolle] ?? 'gutachter'
  const titel = art === 'anfrage' ? 'Neue Netzwerk-Anfrage' : 'Netzwerk-Anfrage angenommen'
  const inhalt =
    art === 'anfrage'
      ? `${absender.name} möchte sich mit dir vernetzen.`
      : `${absender.name} hat deine Netzwerk-Anfrage angenommen.`
  await createMitteilung({
    empfaenger_id: empfaengerProfilId,
    empfaenger_rolle: rolle as EmpfaengerRolle,
    kategorie: 'update',
    titel,
    inhalt,
    route_url: `/${portal}/netzwerk?tab=${art === 'anfrage' ? 'anfragen' : 'verbindungen'}`,
    absender_id: absender.profilId,
    absender_name: absender.name,
    prioritaet: 'normal',
  })
}
