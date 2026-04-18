'use server'

// AAR-358: CRUD für personenschaden_personen. Dispatch legt beim Setzen von
// personenschaden_flag=true eine oder mehrere Personen mit lead_id an;
// signSAandCreateFall upgraded später fall_id. Per-Person-Dokumente
// (Attest, AU, Krankenhaus) werden in einem Folge-Ticket wired.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PersonenschadenPersonInput = {
  id?: string
  vorname?: string | null
  nachname?: string | null
  geburtsdatum?: string | null
  verletzungsart?: string | null
  ist_fahrzeuginsasse?: boolean
  notizen?: string | null
}

export type PersonenschadenPerson = {
  id: string
  lead_id: string | null
  fall_id: string | null
  vorname: string | null
  nachname: string | null
  geburtsdatum: string | null
  verletzungsart: string | null
  ist_fahrzeuginsasse: boolean
  notizen: string | null
  created_at: string
  updated_at: string
}

export async function listPersonenForLead(
  leadId: string,
): Promise<{ success: boolean; personen?: PersonenschadenPerson[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data, error } = await supabase
    .from('personenschaden_personen')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, personen: (data ?? []) as PersonenschadenPerson[] }
}

export async function upsertPersonForLead(
  leadId: string,
  input: PersonenschadenPersonInput,
): Promise<{ success: boolean; person?: PersonenschadenPerson; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const payload = {
    lead_id: leadId,
    vorname: input.vorname ?? null,
    nachname: input.nachname ?? null,
    geburtsdatum: input.geburtsdatum ?? null,
    verletzungsart: input.verletzungsart ?? null,
    ist_fahrzeuginsasse: input.ist_fahrzeuginsasse ?? true,
    notizen: input.notizen ?? null,
  }

  const { data, error } = input.id
    ? await supabase
        .from('personenschaden_personen')
        .update(payload)
        .eq('id', input.id)
        .eq('lead_id', leadId)
        .select('*')
        .single()
    : await supabase
        .from('personenschaden_personen')
        .insert(payload)
        .select('*')
        .single()

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, person: data as PersonenschadenPerson }
}

export async function deletePersonForLead(
  leadId: string,
  personId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('personenschaden_personen')
    .delete()
    .eq('id', personId)
    .eq('lead_id', leadId)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}
