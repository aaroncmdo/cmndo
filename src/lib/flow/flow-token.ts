// Geteilt: flow_links-Token -> leadId (mit Ablauf-Check). Extrahiert aus
// self-service-feststellung-actions (Consumer: dort + /api/flow/[token]/intake).
import { createAdminClient } from '@/lib/supabase/admin'

export async function resolveFlowLeadId(token: string): Promise<{
  admin: ReturnType<typeof createAdminClient> | null
  leadId: string | null
  error?: string
}> {
  if (!token) return { admin: null, leadId: null, error: 'Kein Token.' }
  const admin = createAdminClient()
  const { data: flowLink } = await admin
    .from('flow_links')
    .select('lead_id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (flowLink) {
    if (flowLink.expires_at && new Date(flowLink.expires_at as string).getTime() < Date.now()) {
      return { admin, leadId: null, error: 'Dieser Link ist abgelaufen.' }
    }
    return { admin, leadId: (flowLink.lead_id as string | null) ?? null }
  }
  return { admin, leadId: token } // Backward-compat: Token = lead_id
}
