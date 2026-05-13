'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// AAR-471 C5: Server-Action zum Persistieren der Schadensfoto-URLs im
// leads-Record. Wird am Ende von Schritt 2a aufgerufen — der Upload in
// den Storage-Bucket erfolgt direkt vom Client (siehe upload-foto.ts),
// hier wird nur der JSON-Array in leads.schadensfoto_urls geschrieben.

type Foto = { bereich: string; url: string }

type Result = { success: true } | { success: false; error: string }

export async function updateLeadFotos(leadId: string, fotos: Foto[]): Promise<Result> {
  if (!leadId) return { success: false, error: 'Lead-ID fehlt' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ schadensfoto_urls: fotos })
    .eq('id', leadId)
  if (error) return { success: false, error: error.message }
  // 13.05.2026 Server-Actions-Audit Fix: Dispatch-Lead-Grid + Detail-Page
  // zeigen schadensfoto_urls; ohne revalidate sieht der Dispatcher die
  // frisch hochgeladenen Fotos erst nach Hard-Refresh.
  revalidatePath('/dispatch/leads')
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}
