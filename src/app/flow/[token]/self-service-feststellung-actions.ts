'use server'

// AAR-956 P4-A: token-basierter Self-Service-Save der deklarativen Feststellungs-
// Felder auf den Lead (anon, vor der SA). Resolve via flow_links-Token (wie die
// anderen self-service-actions); Allowlist/Coercion serverseitig aus onboarding_felder.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ladeLeadErfassungLeadsFelder,
  coerceLeadErfassungWert,
} from '@/lib/onboarding/lead-erfassung-allowlist'

async function resolveFlowLeadId(token: string): Promise<{
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

export async function speichereFeststellungFlow(
  token: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLeadId(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // SA-Lockdown: nach Konvertierung ist der Fall SSoT, kein Lead-Edit mehr.
  const { data: lead } = await admin
    .from('leads')
    .select('sa_unterschrieben')
    .eq('id', leadId)
    .maybeSingle()
  if (lead?.sa_unterschrieben) {
    return { ok: false, error: 'Dieser Vorgang ist bereits abgeschlossen.' }
  }

  const feldMap = await ladeLeadErfassungLeadsFelder()
  const update: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(values)) {
    const meta = feldMap.get(key)
    if (!meta) continue // unbekannt / Sentinel / zb1-upload -> skip
    update[meta.spalte] = coerceLeadErfassungWert(meta.typ, raw)
  }
  if (Object.keys(update).length === 0) return { ok: true }

  update.updated_at = new Date().toISOString()
  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}
