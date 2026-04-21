'use server'

// AAR-317 MVP: Unfallskizze-Server-Actions für Dispatch.
// generateAndSave: Claude-API-Call + persist auf leads.unfallskizze_svg
// approveSkizze: MA-Freigabe (unfallskizze_bestaetigt=true)
// clearSkizze: Ablehnen + re-generieren ermöglichen

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { generateUnfallskizze } from '@/lib/unfallskizze/generate'

export async function generateAndSaveUnfallskizze(
  leadId: string,
): Promise<{ success: boolean; error?: string; svg?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'dispatch', 'kundenbetreuer'].includes(rolle ?? '')) {
    return { success: false, error: 'Nicht autorisiert' }
  }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('unfallhergang, schadentyp, gegner_fahrzeugtyp')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const result = await generateUnfallskizze({
    unfallhergang: lead.unfallhergang ?? null,
    schadentyp: lead.schadentyp ?? null,
    gegnerFahrzeugtyp: lead.gegner_fahrzeugtyp ?? null,
  })
  if (!result.success) return { success: false, error: result.error }

  const { error: updErr } = await admin
    .from('leads')
    .update({
      unfallskizze_svg: result.svg,
      unfallskizze_bestaetigt: false,
      unfallskizze_ablehnung_grund: null,
      unfallskizze_generiert_am: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (updErr) return { success: false, error: updErr.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, svg: result.svg }
}

export async function approveUnfallskizze(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({ unfallskizze_bestaetigt: true })
    .eq('id', leadId)
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}

export async function clearUnfallskizze(
  leadId: string,
  grund?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      unfallskizze_svg: null,
      unfallskizze_bestaetigt: false,
      unfallskizze_ablehnung_grund: grund?.trim() || null,
    })
    .eq('id', leadId)
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}
