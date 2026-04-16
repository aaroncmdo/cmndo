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
  // AAR-176 P2-B: unfallort_kategorie automatisch aus schadentyp ableiten —
  // der MA muss den Ort nicht mehr doppelt pflegen. Nur setzen, wenn aus dem
  // Schadentyp eine eindeutige Ortskategorie folgt; für „sonstiges" bleibt
  // der Wert unverändert (könnte z. B. vom Kunden-Portal eingepflegt sein).
  // AAR-179 Audit-Fix #6: Nur überschreiben wenn noch leer — sonst
  // überschreibt ein späterer Schadentyp-Wechsel eine manuell gepflegte
  // Kategorie (Daten-Race zwischen Phase 1 und Phase 3).
  // AAR-215: KATEGORIE_AUTO muss exakt dem CHECK-Constraint von
  // unfallort_kategorie entsprechen (Migration aar74_unfallskizze_zeugen.sql):
  //   parkluecke | kreuzung | autobahn | landstrasse | innerorts | sonstiges
  // Vorher schrieben spurwechsel + auffahrunfall = 'strasse' und parkplatz =
  // 'parkplatz' — beides nicht im Constraint → silent DB-Constraint-Violation,
  // Save schlug ohne UI-Feedback fehl. spurwechsel + auffahrunfall haben
  // keinen eindeutigen Ort (kann Innerorts/Landstraße/Autobahn sein) → null,
  // der MA setzt es manuell in Phase 4.
  const KATEGORIE_AUTO: Record<string, string | null> = {
    spurwechsel: null,
    auffahrunfall: null,
    vorfahrtsverletzung: 'kreuzung',
    parkplatz: 'parkluecke',
    sonstiges: null,
  }
  const autoKategorie = KATEGORIE_AUTO[schadentyp]
  if (autoKategorie) {
    const { data: currentLead } = await supabase
      .from('leads')
      .select('unfallort_kategorie')
      .eq('id', leadId)
      .maybeSingle()
    if (!currentLead?.unfallort_kategorie) {
      updates.unfallort_kategorie = autoKategorie
    }
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
