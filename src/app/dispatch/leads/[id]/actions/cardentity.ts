'use server'

// AAR-143: Cardentity-Anreicherung extrahiert aus actions.ts (AAR-84).
// Liest die FIN auf dem Lead, ruft Cardentity-API auf und schreibt die
// gewonnenen Fahrzeug-Stammdaten auf den Lead zurück.
// AAR-311: Manueller Typ-B-Trigger (Dispatcher kann ihn vor dem SV-Termin
// auslösen wenn er im Gespräch Vorschadenhinweise hat).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { RequestTypBResult } from '@/lib/cardentity/typ-b'

export async function enrichLeadCardentity(
  leadId: string,
): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { enrichLeadByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
  const result = await enrichLeadByFin(leadId)
  if (!result.success) return { success: false, error: result.error }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, updatedFields: result.updatedFields }
}

export async function requestCardentityTypBForLead(
  leadId: string,
): Promise<RequestTypBResult> {
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
    return { success: false, error: 'Nur Dispatch/KB/Admin dürfen Typ-B triggern' }
  }

  const { requestCardentityTypB } = await import('@/lib/cardentity/typ-b')
  const result = await requestCardentityTypB('lead', leadId)
  if (result.success) revalidatePath(`/dispatch/leads/${leadId}`)
  return result
}
