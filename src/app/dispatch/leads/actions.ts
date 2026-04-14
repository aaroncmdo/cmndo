'use server'

// AAR-110: Manuelle Lead-Anlage
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface CreateManualLeadInput {
  vorname: string
  nachname: string
  telefon: string
  email: string
  plz: string
  schadenfall_typ: string
  service_typ: string
  source_channel: string
  notizen: string
}

export async function createManualLead(
  data: CreateManualLeadInput,
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  if (!data.telefon) return { success: false, error: 'Telefon ist Pflicht' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (!['admin', 'kundenbetreuer', 'dispatch', 'leadbearbeiter'].includes(profile?.rolle ?? '')) {
    return { success: false, error: 'Keine Berechtigung' }
  }

  const admin = createAdminClient()
  const { data: lead, error } = await admin.from('leads').insert({
    vorname: data.vorname || null,
    nachname: data.nachname || null,
    telefon: data.telefon,
    email: data.email || null,
    kunde_plz: data.plz || null,
    schadentyp: data.schadenfall_typ || null,
    service_typ: data.service_typ,
    source_channel: data.source_channel,
    qualifizierungs_phase: 'neu',
    status: 'neu',
    kunden_konstellation: 'kk-01',
    zugewiesen_an: user.id,
    notiz: data.notizen || null,
  }).select('id').single()

  if (error || !lead) return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }

  revalidatePath('/dispatch/leads')
  return { success: true, leadId: lead.id }
}
