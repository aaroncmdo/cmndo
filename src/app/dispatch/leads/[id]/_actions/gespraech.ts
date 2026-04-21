'use server'

// AAR-143: Gesprächs-Timer-Aktionen extrahiert aus actions.ts.
// AAR-114 Notion-Spec §1: 8-Minuten-Gesprächsleitfaden mit Start/Ende-Trigger.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function startGespraech(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      gespraech_gestartet_am: new Date().toISOString(),
      gespraech_beendet_am: null,
      gespraech_dauer_sekunden: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}

export async function endeGespraech(
  leadId: string,
): Promise<{ success: boolean; dauerSekunden?: number; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('gespraech_gestartet_am')
    .eq('id', leadId)
    .single()

  if (!lead?.gespraech_gestartet_am) {
    return { success: false, error: 'Gespräch wurde nicht gestartet' }
  }

  const beendetAm = new Date()
  const dauerSekunden = Math.max(
    0,
    Math.floor((beendetAm.getTime() - new Date(lead.gespraech_gestartet_am).getTime()) / 1000),
  )

  const { error } = await supabase
    .from('leads')
    .update({
      gespraech_beendet_am: beendetAm.toISOString(),
      gespraech_dauer_sekunden: dauerSekunden,
      updated_at: beendetAm.toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, dauerSekunden }
}
