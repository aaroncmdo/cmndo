import { createServiceClient } from '@/lib/supabase/server'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'
import type { EmpfaengerRolle } from '@/lib/mitteilungen/types'

// C3c (Fundament, "Eine Glocke"): `benachrichtigungen` war eine TOTE Tabelle — KEIN
// Bell-Reader liest sie (bestaetigt in netzwerk/mitteilung.ts). Alle createNotification-
// Notifs (neuer-lead/filmcheck/vs-abgelehnt/...) landeten dort UNSICHTBAR (2557 ungelesene
// Alt-Rows auf prod, 08.08.). Jetzt: Adapter auf die ECHTE Glocke (`mitteilungen`).
//   - empfaenger_rolle kommt 1:1 aus profiles.rolle (user_role-Enum == EmpfaengerRolle, kein CHECK).
//   - typ -> kategorie 'update' (mitteilungen kennt kein freies typ; die Semantik traegt titel/inhalt,
//     das Icon setzt createMitteilung automatisch aus kategorie/kontext).
//   - link -> route_url (direkt durchgereicht; createMitteilung nutzt input.route_url wenn gesetzt).
// Signatur bewusst unveraendert -> die ~21 Call-Sites bleiben, ihre Notifs werden nur endlich sichtbar.
export async function createNotification(
  userId: string,
  typ: string,
  titel: string,
  beschreibung?: string,
  link?: string,
) {
  const svc = createServiceClient()
  const { data: profile } = await svc
    .from('profiles')
    .select('rolle')
    .eq('id', userId)
    .maybeSingle()
  const rolle = (profile?.rolle as EmpfaengerRolle | null) ?? null
  if (!rolle) {
    console.error(`[createNotification] keine rolle fuer user ${userId} (typ=${typ}) — Notif verworfen`)
    return
  }
  await createMitteilung({
    empfaenger_id: userId,
    empfaenger_rolle: rolle,
    kategorie: 'update',
    titel,
    inhalt: beschreibung,
    route_url: link,
  })
}
