'use server'

// AAR-143: Rückruf-Aktionen extrahiert aus actions.ts (AAR-98).
// Speichern + als erledigt markieren — beide setzen die Lead-Phase
// implizit (rueckruf bei save, unverändert bei mark erledigt).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// AAR-619: Actions geben jetzt { success, error } zurück statt zu throwen —
// der Client kann Errors inline anzeigen (Toast, rote Inline-Meldung) ohne
// globalen Error-Boundary. Vorher war der catch-Block im RueckrufSection
// leer (`catch { /* */ }`) → Fehler wurden stumm geschluckt und der User
// sah weder Erfolg noch Fehler.

export type RueckrufActionResult = { success: boolean; error?: string }

export async function saveRueckruf(
  leadId: string,
  datumIso: string | null,
  notiz: string | null,
): Promise<RueckrufActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      rueckruf_datum: datumIso,
      rueckruf_notiz: notiz,
      rueckruf_erledigt: false,
      qualifizierungs_phase: datumIso ? 'rueckruf' : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
  return { success: true }
}

export async function markRueckrufErledigt(leadId: string): Promise<RueckrufActionResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      rueckruf_erledigt: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
  return { success: true }
}
