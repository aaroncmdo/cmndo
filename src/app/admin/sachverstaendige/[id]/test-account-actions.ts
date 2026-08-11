'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Gutachter-Onboarding-Audit (Befund #6): Admin-Toggle für das ist_testaccount-Flag.
// Ein markierter Test-Account faellt aus Karte (anon-RLS), Dispatch/MCP
// (applyDispatchableFilter) und dem LP-Region-Count. Ersetzt die fruehere
// firmenname-ILIKE-Heuristik durch eine explizite, admin-steuerbare Kennzeichnung.
//
// Schreibt via createAdminClient (untyped) — die Spalte ist neu und noch nicht im
// generierten database.types; der typisierte Client wuerde hier tsc-Fehler werfen.
export async function setzeSvTestaccount(
  svId: string,
  istTestaccount: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') {
    return { success: false, error: 'Nur Admins dürfen Test-Accounts markieren.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('sachverstaendige')
    .update({ ist_testaccount: istTestaccount })
    .eq('id', svId)
  if (error) return { success: false, error: `Update fehlgeschlagen: ${error.message}` }

  revalidatePath(`/admin/vertrieb/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  return { success: true }
}
