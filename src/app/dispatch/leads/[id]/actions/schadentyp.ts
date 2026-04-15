'use server'

// AAR-143: Schadentyp-Speicherung extrahiert aus actions.ts.
// AAR-83 Parkplatz-Kamera-Check inkl. automatischer Disqualifizierung wenn
// kein Gegner-KZ + keine Kamera vorhanden ist.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveSchadentyp(
  leadId: string,
  schadentyp: 'spurwechsel' | 'auffahrunfall' | 'vorfahrtsverletzung' | 'parkplatz' | 'sonstiges',
  freitext?: string | null,
  parkplatzKamera?: boolean | null,
): Promise<{ success: boolean; disqualifiziert?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  let disqualifiziert = false
  const updates: Record<string, unknown> = {
    schadentyp,
    schadentyp_freitext: schadentyp === 'sonstiges' ? freitext ?? null : null,
    updated_at: new Date().toISOString(),
  }
  if (schadentyp === 'parkplatz' && parkplatzKamera !== undefined) {
    updates.parkplatz_kamera = parkplatzKamera
    if (parkplatzKamera === false) {
      const { data: lead } = await supabase
        .from('leads')
        .select('gegner_kennzeichen')
        .eq('id', leadId)
        .maybeSingle()
      if (!lead?.gegner_kennzeichen?.trim()) {
        updates.qualifizierungs_phase = 'disqualifiziert'
        updates.disqualifikations_grund = 'Parkplatz ohne Kennzeichen + keine Überwachungskamera'
        updates.disqualifikations_grund_key = 'parkplatz_ohne_kamera'
        disqualifiziert = true
      }
    }
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, disqualifiziert }
}
