'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Admin-Toggle fuer `sachverstaendige.ki_sichtbar` (Migration 20260824223316).
//
// Bis hierher entschied allein ist_aktiv + verifiziert + Isochrone, ob ein SV im
// oeffentlichen Kanal auftaucht — „im Netz aktiv" und „wird KI-Assistenten als buchbar
// genannt" waren dasselbe. Ein SV, der Faelle ueber Dispatch annimmt, aber nicht auf
// Stadtseiten und in ChatGPT-Antworten stehen soll, liess sich nicht abbilden.
//
// ⚠ Der Schalter wirkt NUR auf den oeffentlichen Pfad (planeTerminOeffentlich +
// Verfuegbarkeits-Streifen), NICHT auf `applyDispatchableFilter`. Wer dort herausfaellt,
// bekaeme ueberhaupt keine Faelle mehr — das ist ausdruecklich nicht gemeint.
//
// Schreibt via createAdminClient (untyped): die Spalte ist neu und noch nicht in
// database.types; der typisierte Client wuerde hier tsc-Fehler werfen (dasselbe
// Vorgehen wie bei setzeSvTestaccount).
export async function setzeSvKiSichtbar(
  svId: string,
  kiSichtbar: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: me } = await supabase.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  if (me?.rolle !== 'admin') {
    return { success: false, error: 'Nur Admins dürfen die KI-Sichtbarkeit ändern.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('sachverstaendige')
    .update({ ki_sichtbar: kiSichtbar })
    .eq('id', svId)
  if (error) return { success: false, error: `Update fehlgeschlagen: ${error.message}` }

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  return { success: true }
}
