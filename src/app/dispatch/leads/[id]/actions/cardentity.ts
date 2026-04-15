'use server'

// AAR-143: Cardentity-Anreicherung extrahiert aus actions.ts (AAR-84).
// Liest die FIN auf dem Lead, ruft Cardentity-API auf und schreibt die
// gewonnenen Fahrzeug-Stammdaten auf den Lead zurück.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
