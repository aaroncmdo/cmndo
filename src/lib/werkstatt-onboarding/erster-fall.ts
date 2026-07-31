// Werkstatt-Onboarding-Drip — Stop-Signal: hat die Werkstatt ihren ersten Fall?
// Kanonisch/RLS-sauber: partner_provisionen (UNIQUE je (partner_typ, claim_id)) ist der
// Zaehlweg (claims traegt keine Werkstatt-RLS); zusaetzlich der direkte claims-FK.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function hatErstenFall(db: SupabaseClient, werkstattId: string): Promise<boolean> {
  const { count: prov } = await db
    .from('partner_provisionen')
    .select('id', { count: 'exact', head: true })
    .eq('partner_typ', 'werkstatt')
    .eq('partner_id', werkstattId)
  if ((prov ?? 0) > 0) return true

  const { count: claim } = await db
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('reparatur_werkstatt_id', werkstattId)
  return (claim ?? 0) > 0
}
