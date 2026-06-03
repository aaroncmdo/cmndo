'use server'

// P2d-4 Task-5b: v2 erfasst parkplatz_kamera als reine Claim-Evidenz (Kamera-
// Betreiber-Anschreiben). KEINE Auto-Disqualifikation (v2 nutzt das manuelle
// GatesPanel-Flag). Die Legacy-Funktionen saveSchadentyp/clearSchadentyp (Phasen-
// UI/SchadentypPicker) wurden im P3b-Cutover entfernt; unfallort_kategorie wird
// jetzt via derive-dispatch-felder (saveDispatchLeadFelder) abgeleitet.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setParkplatzKamera(
  leadId: string,
  value: boolean,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }
  const { error } = await supabase
    .from('leads')
    .update({ parkplatz_kamera: value, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}
