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

// AAR-81+83+114: Schadentyp speichern + AAR-83 Parkplatz-Kamera-Check
export async function saveSchadentyp(
  leadId: string,
  schadentyp: 'spurwechsel' | 'auffahrunfall' | 'vorfahrtsverletzung' | 'parkplatz' | 'sonstiges',
  freitext?: string | null,
  parkplatzKamera?: boolean | null,
): Promise<{ success: boolean; disqualifiziert?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  let disqualifiziert = false
  const updates: Record<string, unknown> = {
    schadentyp,
    schadentyp_freitext: schadentyp === 'sonstiges' ? freitext ?? null : null,
    updated_at: new Date().toISOString(),
  }
  if (schadentyp === 'parkplatz' && parkplatzKamera !== undefined) {
    updates.parkplatz_kamera = parkplatzKamera
    if (parkplatzKamera === false) {
      const { data: lead } = await supabase.from('leads').select('gegner_kennzeichen').eq('id', leadId).maybeSingle()
      if (!lead?.gegner_kennzeichen?.trim()) {
        updates.qualifizierungs_phase = 'disqualifiziert'
        updates.disqualifikations_grund = 'Parkplatz ohne Kennzeichen + keine Überwachungskamera'
        updates.disqualifikations_grund_key = 'parkplatz_ohne_kamera'
        disqualifiziert = true
      }
    }
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, disqualifiziert }
}

// AAR-114: Gespraechsleitfaden-Timer (Notion-Spec §1)
export async function startGespraech(leadId: string): Promise<{ success: boolean; error?: string }> {
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

export async function endeGespraech(leadId: string): Promise<{ success: boolean; dauerSekunden?: number; error?: string }> {
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

// AAR-98: Rueckruf speichern + als erledigt markieren (migriert von admin/dispatch/lead)
export async function saveRueckruf(leadId: string, datumIso: string | null, notiz: string | null) {
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

// AAR-84: Cardentity-Anreicherung
export async function enrichLeadCardentity(leadId: string): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { enrichLeadByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
  const result = await enrichLeadByFin(leadId)
  if (!result.success) return { success: false, error: result.error }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, updatedFields: result.updatedFields }
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
): Promise<{ success: boolean; disqualifiziert?: boolean; grund?: string; grundKey?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-114: Disqualifikations-Check mit grund_key (Notion-Spec §2)
  // kein_schaden: schaden_sichtbar=false UND keine der 3 Nachfrage-Flags
  // (personenschaden, mietwagen, nutzungsausfall)
  let disqualifiziert = false
  let grund: string | undefined
  let grundKey: 'eigenverantwortung' | 'kein_schaden' | 'kein_haftpflicht' | undefined

  if (data.schuldfrage === 'eigenverantwortung') {
    disqualifiziert = true
    grund = 'Eigenverantwortung / Kasko-Fall'
    grundKey = 'eigenverantwortung'
  } else if (
    data.schaden_sichtbar === false &&
    !data.personenschaden_flag &&
    !data.mietwagen_flag &&
    !data.nutzungsausfall
  ) {
    disqualifiziert = true
    grund = 'Kein sichtbarer Schaden und keine Personenschaden/Mietwagen/Nutzungsausfall-Flags'
    grundKey = 'kein_schaden'
  } else if (data.hat_haftpflicht === false) {
    disqualifiziert = true
    grund = 'Kasko / eigene Versicherung — kein Haftpflichtschaden'
    grundKey = 'kein_haftpflicht'
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
    updates.disqualifikations_grund_key = grundKey
  } else {
    // AAR-114: Wenn alle 3 Fragen beantwortet sind und nicht disqualifiziert → in-qualifizierung
    const q1Complete =
      !!data.unfallhergang &&
      !!data.schuldfrage &&
      (data.schuldfrage !== 'unklar' || data.aufklaerung_teilschuld_bestaetigt === true)
    const q2Complete = data.schaden_sichtbar !== null && data.schaden_sichtbar !== undefined
    const q3Complete = data.hat_haftpflicht !== null && data.hat_haftpflicht !== undefined

    if (q1Complete && q2Complete && q3Complete) {
      updates.qualifizierungs_phase = 'in-qualifizierung'
    }
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, disqualifiziert, grund, grundKey }
}

