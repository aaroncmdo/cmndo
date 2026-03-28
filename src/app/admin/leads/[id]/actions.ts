'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function sendFlowLink(leadId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon')
    .eq('id', leadId)
    .single()

  if (!lead) throw new Error('Lead nicht gefunden')

  // Lead-ID IS the token – no random UUID needed
  const { error: leadErr } = await supabase
    .from('leads')
    .update({
      status: 'flow-gesendet',
      wa_gesendet: true,
    })
    .eq('id', leadId)

  if (leadErr) throw new Error(`Lead-Update fehlgeschlagen: ${leadErr.message}`)

  revalidatePath(`/admin/leads/${leadId}`)
  revalidatePath('/admin/leads')

  return { token: lead.id }
}
