'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// AAR-637: Rückruf-Erledigt-Status wandert auf admin_termine (typ='rueckruf',
// status='erledigt'). leads.rueckruf_erledigt wurde gedroppt.

async function closeOpenRueckrufTermin(leadId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  await supabase
    .from('admin_termine')
    .update({ status: 'erledigt', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
}

export async function markAngerufen(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  await closeOpenRueckrufTermin(leadId, supabase)

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'in-qualifizierung',
      letzter_anruf_am: now,
      letzter_anruf_status: 'erreicht',
      updated_at: now,
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  revalidatePath('/dispatch/rueckrufe')
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
  revalidatePath('/admin/kalender')
}

export async function markNichtErreicht(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  const { data: lead } = await supabase
    .from('leads')
    .select('anruf_versuche')
    .eq('id', leadId)
    .single()

  const versuche = ((lead?.anruf_versuche as number) ?? 0) + 1

  const updates: Record<string, unknown> = {
    anruf_versuche: versuche,
    letzter_anruf_am: now,
    letzter_anruf_status: 'nicht_erreicht',
    updated_at: now,
  }

  if (versuche >= 2) {
    updates.qualifizierungs_phase = 'kalt'
    await closeOpenRueckrufTermin(leadId, supabase)
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)

  if (error) throw new Error(error.message)

  revalidatePath('/dispatch/rueckrufe')
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
  revalidatePath('/admin/kalender')
}
