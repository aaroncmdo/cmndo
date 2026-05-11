'use server'

// Manueller Re-Push des Mandats an die Kanzlei (LexDrive).
// Trigger fuer KB/Admin wenn der initiale Auto-Push fehlgeschlagen ist
// (LexDrive-Down, falsche Telefonnummer, etc.) oder wenn der Kunde
// nachtraeglich partnerkanzlei waehlt.
//
// Idempotent: pushMandatToKanzlei skipt wenn service_typ + kanzlei_wunsch
// keinen Push erlauben. Wenn mandatsnummer schon gesetzt ist, akzeptiert
// die Salesforce-Seite Duplikate ueber den X-Claimondo-Event-Id-Header.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { pushMandatToKanzlei } from '@/lib/kanzlei/push-mandat'

export async function pushMandatManuell(
  fallId: string,
): Promise<{ ok: boolean; error?: string; mandatsnummer?: string | null }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  const erlaubt = profile && ['admin', 'kundenbetreuer'].includes(profile.rolle as string)
  if (!erlaubt) return { ok: false, error: 'Nur Admin oder Kundenbetreuer' }

  const result = await pushMandatToKanzlei(fallId)
  revalidatePath(`/faelle/${fallId}`)

  if (!result.success) {
    return { ok: false, error: result.error ?? 'Push fehlgeschlagen' }
  }
  return { ok: true, mandatsnummer: result.kanzlei_mandat_id }
}
