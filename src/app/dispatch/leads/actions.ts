'use server'

// AAR-110: Manuelle Lead-Anlage
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// AAR-216: schadens_fall_typ aus dem Manual-Lead-Input entfernt — der MA kennt
// den Schadentyp beim Anlegen noch nicht, dieser wird in Phase 2 erfasst.
// AAR-695: service_typ raus (wird im Lead-Flow gesetzt, ist Endpoint-Sender
// für die Kanzlei). PLZ-Freitext durch Google-Maps-Auswahl ersetzt
// (Adresse + PLZ + Lat/Lng als Bundle).
export interface CreateManualLeadInput {
  vorname: string
  nachname: string
  telefon: string
  email: string
  kunde_adresse: string
  kunde_plz: string
  kunde_lat: number | null
  kunde_lng: number | null
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
    kunde_adresse: data.kunde_adresse || null,
    kunde_plz: data.kunde_plz || null,
    kunde_lat: data.kunde_lat,
    kunde_lng: data.kunde_lng,
    // AAR-216: schadentyp NICHT mehr beim Anlegen — wird in Phase 2 gesetzt.
    // AAR-695: service_typ NICHT mehr beim Anlegen — wird im Lead-Flow gesetzt.
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
