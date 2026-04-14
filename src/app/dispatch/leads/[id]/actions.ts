'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setLeadPhase(leadId: string, phase: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: phase,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/dashboard')
}

export async function setLeadRueckruf(leadId: string, datum: string, notiz: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'rueckruf',
      rueckruf_datum: datum || null,
      rueckruf_notiz: notiz || null,
      rueckruf_erledigt: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/rueckrufe')
}

export async function disqualifiziereLead(leadId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({
      qualifizierungs_phase: 'disqualifiziert',
      status: 'disqualifiziert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  // Timeline/Notiz
  await supabase.from('timeline').insert({
    lead_id: leadId,
    typ: 'system',
    titel: 'Lead disqualifiziert',
    beschreibung: grund || 'Vom Dispatcher disqualifiziert',
    erstellt_von: user.id,
  }).then(() => {})

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
}

export async function setServiceTyp(leadId: string, serviceTyp: 'komplett' | 'nur_gutachter') {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({ service_typ: serviceTyp, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath(`/dispatch/leads/${leadId}`)
}

// AAR-81: Schadentyp speichern
export async function saveSchadentyp(
  leadId: string,
  schadentyp: 'spurwechsel' | 'auffahrunfall' | 'vorfahrtsverletzung' | 'parkplatz' | 'sonstiges',
  freitext?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({
      schadentyp,
      schadentyp_freitext: schadentyp === 'sonstiges' ? freitext ?? null : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}

// AAR-80: Schritt 0 Hard Gate — Q1/Q2/Q3
export type HardGateData = {
  unfallhergang?: string
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung'
  aufklaerung_teilschuld_bestaetigt?: boolean
  schaden_sichtbar?: boolean
  personenschaden_flag?: boolean
  mietwagen_flag?: boolean
  nutzungsausfall?: boolean
  hat_haftpflicht?: boolean
}

export async function saveHardGate(
  leadId: string,
  data: HardGateData,
): Promise<{ success: boolean; disqualifiziert?: boolean; grund?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Disqualifikations-Check
  let disqualifiziert = false
  let grund: string | undefined

  if (data.schuldfrage === 'eigenverantwortung') {
    disqualifiziert = true
    grund = 'Eigenverantwortung / Kasko-Fall'
  } else if (data.schaden_sichtbar === false && !data.personenschaden_flag) {
    disqualifiziert = true
    grund = 'Kein sichtbarer Schaden und kein Personenschaden'
  } else if (data.hat_haftpflicht === false) {
    disqualifiziert = true
    grund = 'Keine Haftpflicht beim Gegner'
  }

  const updates: Record<string, unknown> = {
    ...(data.unfallhergang !== undefined && { unfallhergang: data.unfallhergang }),
    ...(data.schuldfrage !== undefined && { schuldfrage: data.schuldfrage }),
    ...(data.aufklaerung_teilschuld_bestaetigt !== undefined && { aufklaerung_teilschuld_bestaetigt: data.aufklaerung_teilschuld_bestaetigt }),
    ...(data.schaden_sichtbar !== undefined && { schaden_sichtbar: data.schaden_sichtbar }),
    ...(data.personenschaden_flag !== undefined && { personenschaden_flag: data.personenschaden_flag }),
    ...(data.mietwagen_flag !== undefined && { mietwagen_flag: data.mietwagen_flag }),
    ...(data.nutzungsausfall !== undefined && { nutzungsausfall: data.nutzungsausfall }),
    ...(data.hat_haftpflicht !== undefined && { hat_haftpflicht: data.hat_haftpflicht }),
    updated_at: new Date().toISOString(),
  }

  if (disqualifiziert) {
    updates.qualifizierungs_phase = 'disqualifiziert'
    updates.disqualifikations_grund = grund
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, disqualifiziert, grund }
}

