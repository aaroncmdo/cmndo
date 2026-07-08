// Ops-Cockpit Phase 3b (Dispatch) — Lead-Pipeline-Panel fuers Dispatch-Dashboard.
// Server-Loader: liest die aktiven Leads via getLeadWorkItems (role-guarded, konsumiert
// die v_lead_workstate-Foundation) und rendert das Work-State-Board. Additiv aufs
// Dashboard — ersetzt nichts.

import { createClient } from '@/lib/supabase/server'
import { InboxIcon } from 'lucide-react'
import { Panel } from '@/components/shared/Panel'
import EmptyState from '@/components/shared/EmptyState'
import { getLeadWorkItems } from '@/app/dispatch/_lib/get-lead-workitems'
import { LeadPipelineBoard } from './LeadPipelineBoard'

export async function LeadPipelinePanel() {
  const supabase = await createClient()
  const res = await getLeadWorkItems(supabase, {})
  // Fehler/Non-Staff -> Panel entfaellt still (Dashboard bleibt intakt).
  if (!res.ok) return null

  return (
    <Panel
      title="Lead-Pipeline"
      actionLabel="Alle Leads"
      actionHref="/dispatch/leads"
      bodyClassName="max-h-[520px] overflow-y-auto"
    >
      {res.items.length === 0 ? (
        <EmptyState icon={InboxIcon} title="Keine aktiven Leads" variant="compact" />
      ) : (
        <LeadPipelineBoard items={res.items} />
      )}
    </Panel>
  )
}
