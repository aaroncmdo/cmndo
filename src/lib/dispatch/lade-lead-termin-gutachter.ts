import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TerminGutachterInfo } from './lead-termin-gutachter'

// AAR-956: Laedt die Single-Source-View v_lead_termin_gutachter fuer eine Menge
// von Leads und liefert eine Map lead_id → Info. Bewusst via Admin-Client
// (service_role): die View ist security_invoker=true (leak-safe), das Dispatch-
// Portal ist serverseitig auth-gegated, und die zugrundeliegenden Tabellen
// (gfa/sachverstaendige/profiles) haben fuer authenticated teils restriktive RLS
// — gleiches Muster wie flow_links im Lead-Detail.
export async function ladeLeadTerminGutachter(
  leadIds: string[],
): Promise<Record<string, TerminGutachterInfo>> {
  if (leadIds.length === 0) return {}
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('v_lead_termin_gutachter')
    .select('*')
    .in('lead_id', leadIds)

  if (error || !data) return {}

  const map: Record<string, TerminGutachterInfo> = {}
  for (const row of data as TerminGutachterInfo[]) {
    map[row.lead_id] = row
  }
  return map
}
