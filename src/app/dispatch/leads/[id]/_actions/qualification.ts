'use server'

// AAR-143: Qualifications-Aktionen extrahiert aus monolithischer actions.ts.
// Phase- und Service-Typ-Updates + Disqualifizierung mit Timeline-Eintrag.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setLeadPhase(
  leadId: string,
  phase: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: phase,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/dashboard')
  return { ok: true }
}

export async function disqualifiziereLead(
  leadId: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'disqualifiziert',
      status: 'disqualifiziert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  await supabase.from('timeline').insert({
    lead_id: leadId,
    typ: 'system',
    titel: 'Lead disqualifiziert',
    beschreibung: grund || 'Vom Dispatcher disqualifiziert',
    erstellt_von: user.id,
  }).then(() => {})

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/dashboard')
  return { ok: true }
}

export async function setServiceTyp(
  leadId: string,
  serviceTyp: 'komplett' | 'nur_gutachter',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({ service_typ: serviceTyp, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}
