// Kunde-Termin-Funnel T1 (Spec 2026-08-05): gutachter_termine ueberleben die Lead→Claim-
// Konversion. Die Engine schreibt Termine bezug-nativ auf 'lead'; nach der Konversion
// fragt die Kunden-Akte nur fall/claim-Achsen ab. convertLeadToClaim haengt deshalb ALLE
// nicht-terminalen Lead-Termine auf bezug 'claim' um (EIN deterministischer Write-Punkt).
// 'verlegt' zaehlt als superseded (der Nachfolger-Termin traegt den offenen Zustand).

import type { SupabaseClient } from '@supabase/supabase-js'

export const TERMINAL_TERMIN_STATUS = ['storniert', 'abgesagt', 'abgelehnt', 'abgeschlossen', 'verlegt'] as const

export function istOffenerTerminStatus(status: string | null): boolean {
  if (!status) return false
  return !(TERMINAL_TERMIN_STATUS as readonly string[]).includes(status)
}

/** Existiert mindestens ein nicht-terminaler bezug-nativer Lead-Termin? (Cursor-Input, T2) */
export async function hatOffeneLeadTermine(admin: SupabaseClient, leadId: string): Promise<boolean> {
  const { data } = await admin
    .from('gutachter_termine')
    .select('id')
    .eq('bezug_typ', 'lead')
    .eq('bezug_id', leadId)
    .not('status', 'in', `(${TERMINAL_TERMIN_STATUS.join(',')})`)
    .limit(1)
  return (data ?? []).length > 0
}

/** Haengt alle nicht-terminalen Lead-Termine auf den Claim um (bezug lead→claim). */
export async function uebernehmeLeadTermine(
  admin: SupabaseClient,
  leadId: string,
  claimId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await admin
    .from('gutachter_termine')
    .update({ bezug_typ: 'claim', bezug_id: claimId })
    .eq('bezug_typ', 'lead')
    .eq('bezug_id', leadId)
    .not('status', 'in', `(${TERMINAL_TERMIN_STATUS.join(',')})`)
    .select('id')
  if (error) return { ok: false, count: 0, error: error.message }
  return { ok: true, count: (data ?? []).length }
}
