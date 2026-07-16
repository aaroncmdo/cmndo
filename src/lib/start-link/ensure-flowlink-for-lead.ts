import 'server-only'

// AAR-956: EINE idempotente, lead-gekeyte Brücke zum kanonischen FlowLink.
// „Ein Lead = ein Link" — egal ob Self-Service (/start → issueCanonicalFlowLinkForAnfrage),
// Dispatcher-Multi-Channel (sendFlowLinkMultiChannel) oder Dispatcher-sendFlowLink den Link
// braucht. Reuse eines noch gültigen flow_links-Eintrags, sonst neu minten (token = DB-Default).
//
// Vorher gab es DREI eigene flow_links-Inserts (issue-canonical + 2x Dispatcher) → pro Send
// ein neuer Token = mehrere Links pro Lead. Diese Funktion ist der EINE Schreibweg.
// service_role (createAdminClient): flow_links ist default-deny für authenticated.

import { createAdminClient } from '@/lib/supabase/admin'

const FLOWLINK_TTL_MS = 72 * 60 * 60 * 1000

export type EnsureFlowLinkResult =
  | { ok: true; token: string; wiederverwendet: boolean }
  | { ok: false; error: string }

export async function ensureCanonicalFlowLinkForLead(
  leadId: string,
  opts?: {
    serviceTyp?: string | null
    sprache?: string | null
    // Optional: bestehenden Admin-Client wiederverwenden (issue-canonical hat schon einen).
    admin?: ReturnType<typeof createAdminClient>
  },
): Promise<EnsureFlowLinkResult> {
  if (!leadId) return { ok: false, error: 'lead_id fehlt' }
  const admin = opts?.admin ?? createAdminClient()

  // Idempotenz: jüngsten noch gültigen (nicht abgelaufenen) Link wiederverwenden.
  const { data: vorhanden } = await admin
    .from('flow_links')
    .select('token, expires_at')
    .eq('lead_id', leadId)
    // CMM-Drift-Fix (16.07.): flow_links hat erstellt_am, NICHT created_at — der Order warf
    // PostgREST-400 -> vorhanden=null -> die Idempotenz griff NIE (jeder Aufruf neuer Link).
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (
    vorhanden?.token &&
    vorhanden.expires_at &&
    new Date(vorhanden.expires_at as string).getTime() > Date.now()
  ) {
    return { ok: true, token: vorhanden.token as string, wiederverwendet: true }
  }

  const { data: fl, error: flErr } = await admin
    .from('flow_links')
    .insert({
      lead_id: leadId,
      expires_at: new Date(Date.now() + FLOWLINK_TTL_MS).toISOString(),
      service_typ: opts?.serviceTyp ?? 'komplett',
      sprache: opts?.sprache ?? 'de',
    })
    .select('token')
    .single()
  if (flErr || !fl?.token) {
    return { ok: false, error: flErr?.message ?? 'FlowLink-Anlage fehlgeschlagen' }
  }
  return { ok: true, token: fl.token as string, wiederverwendet: false }
}
