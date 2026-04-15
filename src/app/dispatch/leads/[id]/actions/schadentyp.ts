'use server'

// AAR-143: Schadentyp-Speicherung extrahiert aus actions.ts.
// AAR-83 Parkplatz-Kamera-Check inkl. automatischer Disqualifizierung wenn
// kein Gegner-KZ + keine Kamera vorhanden ist.
// AAR-175 P1-A: revalidatePath wurde entfernt. Der Aufrufer (SchadentypPicker
// in Phase 2) steuert den Pfad-B-Sprung zu Phase 6 selbst (Client-Side-
// Transition). Der Server-Revalidate würde die aktuelle Phase vom Server neu
// berechnen + Phase 3 rendern, was den Sprung komplett unterdrückt.

import { createClient } from '@/lib/supabase/server'

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
  return { success: true, disqualifiziert }
}
