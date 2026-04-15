'use server'

// AAR-143: Rückruf-Aktionen extrahiert aus actions.ts (AAR-98).
// Speichern + als erledigt markieren — beide setzen die Lead-Phase
// implizit (rueckruf bei save, unverändert bei mark erledigt).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveRueckruf(
  leadId: string,
  datumIso: string | null,
  notiz: string | null,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

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

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
}

export async function markRueckrufErledigt(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      rueckruf_erledigt: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/rueckrufe')
}
