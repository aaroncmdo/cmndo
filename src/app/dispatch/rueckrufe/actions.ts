'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markAngerufen(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'in-qualifizierung',
      rueckruf_erledigt: true,
      letzter_anruf_am: now,
      letzter_anruf_status: 'erreicht',
      updated_at: now,
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  revalidatePath('/dispatch/rueckrufe')
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
}

export async function markNichtErreicht(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  // Aktuelle Versuchsanzahl laden
  const { data: lead } = await supabase
    .from('leads')
    .select('anruf_versuche')
    .eq('id', leadId)
    .single()

  const versuche = ((lead?.anruf_versuche as number) ?? 0) + 1

  // Bei >= 2 Versuchen → kalt
  const updates: Record<string, unknown> = {
    anruf_versuche: versuche,
    letzter_anruf_am: now,
    letzter_anruf_status: 'nicht_erreicht',
    updated_at: now,
  }

  if (versuche >= 2) {
    updates.qualifizierungs_phase = 'kalt'
    updates.rueckruf_erledigt = true
  }

  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  revalidatePath('/dispatch/rueckrufe')
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
}
