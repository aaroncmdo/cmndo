'use server'

// AAR-305 Teil 2: Server-Actions für den "Weitere Angaben"-Step im FlowWizard.
// - saveWerkstattAngaben: Werkstatt-seit-wann-Datum auf leads
// - saveSchadensfotoUrls: Public-URLs der hochgeladenen Fotos in leads.schadensfoto_urls
//   (Fall existiert zu diesem Zeitpunkt noch nicht — bei signSAandCreateFall
//    werden die URLs nach dokumente (fall-bound) übertragen.)

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function saveWerkstattAngaben(
  leadId: string,
  werkstattSeitDatum: string | null,
): Promise<{ success: boolean; error?: string }> {
  if (!leadId) return { success: false, error: 'Lead-ID fehlt' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('leads')
    .update({
      werkstatt_seit_datum: werkstattSeitDatum || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
  return { success: true }
}

export async function saveSchadensfotoUrls(
  leadId: string,
  urls: string[],
): Promise<{ success: boolean; error?: string }> {
  if (!leadId) return { success: false, error: 'Lead-ID fehlt' }
  if (urls.length > 10) {
    return { success: false, error: 'Maximal 10 Fotos erlaubt' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('leads')
    .update({
      schadensfoto_urls: urls,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/leads')
  return { success: true }
}
