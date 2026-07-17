// AAR-956 17.07. (Query-Parse Rest, Klasse A): SV-Anzeigename fuer einen gutachter_termine-Row.
//
// Hintergrund: 4 Read-Sites embeddeten `sachverstaendige(profiles!...)` direkt auf
// gutachter_termine — dort gibt es aber KEINEN FK (sv_id ist FK-los und via CMM-49 in
// Rente; die assignee-Achse ist polymorph und kann keinen FK auf sachverstaendige
// tragen). PostgREST lehnt das Embed mit PGRST200 ab → die GANZE Query starb still:
// SV-Name/Termin fehlten in Kunde-Onboarding, FlowLink-Versand (WA+Email) und der
// T4-Terminbestaetigung. Fix-Muster = Zwei-Schritt-Lookup (Praezedenz: admin/kommentare
// 16.07., bewusst KEIN FK; finde-termin-fuer-lead fuer die assignee-Leseachse).
//
// PARITAET zum alten Embed: einen Namen gibt es NUR fuer assignee_typ='sachverstaendiger'.
// (fall_id-gefilterte Reads koennen kb_beratung-Rows treffen — das alte Embed lieferte
// dort ebenfalls null; ein KB-Name als "Ihr Gutachter" waere falsch.)
//
// Bewusst KEIN 'use server' (reine Util, importierbar) — wie finde-termin-fuer-lead.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAssigneeProfileId } from '@/lib/termine/engine/assignee-profile'

export type AssigneeName = { vorname: string | null; nachname: string | null }

/**
 * Anzeigename des SV-Assignees eines Termins (oder null fuer Nicht-SV/unassigned).
 * Schritt 1: assignee → profile_id (resolveAssigneeProfileId, kennt den
 * sachverstaendige.id→profile_id-Join). Schritt 2: profiles → vorname/nachname.
 */
export async function ladeSvAssigneeName(
  db: SupabaseClient,
  assigneeTyp: string | null,
  assigneeId: string | null,
): Promise<AssigneeName | null> {
  if (assigneeTyp !== 'sachverstaendiger') return null
  const profileId = await resolveAssigneeProfileId(db, assigneeTyp, assigneeId)
  if (!profileId) return null
  const { data } = await db
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', profileId)
    .maybeSingle()
  return (data as AssigneeName | null) ?? null
}
