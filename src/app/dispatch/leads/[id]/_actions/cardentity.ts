'use server'

// Cardentity scharf (2026-05-31): manueller Lead-Trigger. EIN (kostenpflichtiger)
// Report-Pull liefert Fahrzeugdaten + Vorschaden, vehicle-gebunden. Kein
// Auto-Fire mehr. enrichLeadCardentity bleibt als Alias erhalten (gleiche Engine),
// da bestehende Caller (Phase4Stammdaten Enrich-Button) ihn nutzen.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CardentityRunResult } from '@/lib/cardentity/run-full'

async function runLeadCardentityGuarded(leadId: string): Promise<CardentityRunResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'dispatch', 'kundenbetreuer'].includes(rolle ?? '')) {
    return { success: false, error: 'Nur Dispatch/KB/Admin dürfen die Cardentity-Abfrage triggern' }
  }

  const { runCardentityCheck } = await import('@/lib/cardentity/run-full')
  const result = await runCardentityCheck('lead', leadId)
  if (result.success) revalidatePath(`/dispatch/leads/${leadId}`)
  return result
}

/** Alias fuer den bestehenden „Fahrzeugdaten anreichern"-Button — gleiche Engine. */
export async function enrichLeadCardentity(
  leadId: string,
): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const result = await runLeadCardentityGuarded(leadId)
  if (!result.success) return { success: false, error: result.error }
  return { success: true, updatedFields: result.vehicleFieldsUpdated }
}

export async function requestCardentityTypBForLead(
  leadId: string,
): Promise<CardentityRunResult> {
  return runLeadCardentityGuarded(leadId)
}
