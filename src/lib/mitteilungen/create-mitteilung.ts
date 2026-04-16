// AAR-229 W2: Server-Helper zum Erstellen von Mitteilungen.
// Nutzt Admin-Client (Service Role) damit der Insert unabhängig vom
// eingeloggten User funktioniert (RLS-Policy erlaubt INSERT für alle).

import { createAdminClient } from '@/lib/supabase/admin'
import type { CreateMitteilungInput, EmpfaengerRolle, KontextTyp, MitteilungKategorie } from './types'

// F-08: Route-URL Auto-Generation basierend auf Kontext + Rolle.
function autoRouteUrl(
  kontextTyp: KontextTyp | undefined,
  kontextId: string | undefined,
  rolle: EmpfaengerRolle,
): string | null {
  if (!kontextTyp || !kontextId) return null
  const prefix: Record<EmpfaengerRolle, string> = {
    admin: '/admin',
    dispatch: '/dispatch',
    kundenbetreuer: '/admin',
    sachverstaendiger: '/gutachter',
    kanzlei: '/kanzlei',
    kunde: '/kunde',
  }
  const p = prefix[rolle]
  switch (kontextTyp) {
    case 'fall':
      return rolle === 'sachverstaendiger' ? `${p}/fall/${kontextId}` :
             rolle === 'kunde' ? `${p}/faelle/${kontextId}` :
             `${p}/faelle/${kontextId}`
    case 'lead':
      return rolle === 'dispatch' ? `/dispatch/leads/${kontextId}` : `/admin/faelle`
    case 'auftrag':
      return rolle === 'sachverstaendiger' ? `${p}/auftraege` : `${p}/faelle`
    case 'termin':
      return rolle === 'sachverstaendiger' ? `${p}/kalender` : null
    case 'abrechnung':
      return rolle === 'sachverstaendiger' ? `${p}/abrechnung` : null
    case 'nachricht':
      return `${p}/nachrichten`
    default:
      return null
  }
}

// F-07: Icon Auto-Setzung basierend auf Kategorie + Kontext.
function autoIcon(kategorie: MitteilungKategorie, kontextTyp?: KontextTyp): string {
  if (kategorie === 'anruf') return '📞'
  if (kategorie === 'nachricht') return '💬'
  if (kategorie === 'task') return '📌'
  if (kontextTyp === 'fall') return '📁'
  if (kontextTyp === 'lead') return '📋'
  if (kontextTyp === 'termin') return '📅'
  if (kontextTyp === 'abrechnung') return '💶'
  return '🔔'
}

export async function createMitteilung(input: CreateMitteilungInput): Promise<{ id: string } | null> {
  const db = createAdminClient()

  const routeUrl = input.route_url ?? autoRouteUrl(input.kontext_typ, input.kontext_id, input.empfaenger_rolle)
  const icon = input.icon ?? autoIcon(input.kategorie, input.kontext_typ)

  const { data, error } = await db.from('mitteilungen').insert({
    empfaenger_id: input.empfaenger_id,
    empfaenger_rolle: input.empfaenger_rolle,
    kategorie: input.kategorie,
    titel: input.titel,
    inhalt: input.inhalt ?? null,
    kontext_typ: input.kontext_typ ?? null,
    kontext_id: input.kontext_id ?? null,
    route_url: routeUrl,
    icon,
    prioritaet: input.prioritaet ?? 'normal',
    absender_id: input.absender_id ?? null,
    absender_name: input.absender_name ?? null,
  }).select('id').single()

  if (error) {
    console.error('[createMitteilung] Insert fehlgeschlagen:', error.message)
    return null
  }
  return data
}

// Convenience: Mitteilung an MEHRERE Empfänger (z.B. Admin + SV gleichzeitig).
export async function createMitteilungMulti(
  empfaenger: Array<{ id: string; rolle: EmpfaengerRolle }>,
  base: Omit<CreateMitteilungInput, 'empfaenger_id' | 'empfaenger_rolle'>,
): Promise<void> {
  await Promise.allSettled(
    empfaenger.map(e =>
      createMitteilung({ ...base, empfaenger_id: e.id, empfaenger_rolle: e.rolle }),
    ),
  )
}
