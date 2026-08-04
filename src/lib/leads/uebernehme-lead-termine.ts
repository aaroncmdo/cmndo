// Kunde-Termin-Funnel T1 (Spec 2026-08-05): gutachter_termine ueberleben die Lead→Claim-
// Konversion. Die Engine schreibt Termine bezug-nativ auf 'lead'; nach der Konversion
// fragt die Kunden-Akte nur fall/claim-Achsen ab. convertLeadToClaim haengt deshalb ALLE
// nicht-terminalen Lead-Termine auf bezug 'fall' um (claim-first: fall_id==claims.id,
// EIN deterministischer Write-Punkt). BEIDE Lead-Verankerungen (bezug-nativ + legacy
// lead_id-Spalte) werden erfasst; der validate-Trigger lehnt Doppel-Bezug ab.
// 'verlegt' zaehlt als superseded (der Nachfolger-Termin traegt den offenen Zustand).

import type { SupabaseClient } from '@supabase/supabase-js'

export const TERMINAL_TERMIN_STATUS = ['storniert', 'abgesagt', 'abgelehnt', 'abgeschlossen', 'verlegt'] as const

export function istOffenerTerminStatus(status: string | null): boolean {
  if (!status) return false
  return !(TERMINAL_TERMIN_STATUS as readonly string[]).includes(status)
}

/** Beide Lead-Verankerungen: bezug-nativ (bezug_typ='lead') ODER legacy (lead_id-Spalte). */
function leadAnkerOrExpr(leadId: string): string {
  return `and(bezug_typ.eq.lead,bezug_id.eq.${leadId}),lead_id.eq.${leadId}`
}

/** Existiert mindestens ein nicht-terminaler lead-verankerter Termin? (Cursor-Input, T2) */
export async function hatOffeneLeadTermine(admin: SupabaseClient, leadId: string): Promise<boolean> {
  const { data } = await admin
    .from('gutachter_termine')
    .select('id')
    .or(leadAnkerOrExpr(leadId))
    .not('status', 'in', `(${TERMINAL_TERMIN_STATUS.join(',')})`)
    .limit(1)
  return (data ?? []).length > 0
}

/** Haengt alle nicht-terminalen lead-verankerten Termine auf den Fall um (bezug 'fall',
 *  fall_id==claims.id claim-first). lead_id wird im selben UPDATE genullt (validate-Trigger
 *  lehnt Doppel-Bezug ab). */
export async function uebernehmeLeadTermine(
  admin: SupabaseClient,
  leadId: string,
  claimId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await admin
    .from('gutachter_termine')
    .update({ bezug_typ: 'fall', bezug_id: claimId, lead_id: null })
    .or(leadAnkerOrExpr(leadId))
    .not('status', 'in', `(${TERMINAL_TERMIN_STATUS.join(',')})`)
    .select('id')
  if (error) return { ok: false, count: 0, error: error.message }
  return { ok: true, count: (data ?? []).length }
}
