'use server'

// Spec 2026-07-21 (FlowLink operative Vollstaendigkeit) — Loader fuer den werkstatt_anzeige-Step.
// Laedt die dem Lead ZUGEWIESENE Werkstatt (reparatur_werkstatt_id ?? werkstatt_id -> werkstaetten)
// zur reinen Anzeige. Eigene Datei (nicht self-service-actions.ts), um die parallel bearbeitete
// Kern-Action-Datei nicht anzufassen. Token->Lead-Aufloesung minimal inline (resolveFlowLead ist
// privat im Kern-File). createAdminClient ist ungetypt -> Select-Strings sind nicht tsc-geprueft.

import { createAdminClient } from '@/lib/supabase/admin'

export type ZugewieseneWerkstatt = {
  name: string
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  telefon: string | null
}

export async function ladeZugewieseneWerkstattFlow(
  token: string,
): Promise<{ ok: true; werkstatt: ZugewieseneWerkstatt | null } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Kein Token.' }
  const admin = createAdminClient()

  const { data: flowLink } = await admin
    .from('flow_links')
    .select('lead_id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!flowLink?.lead_id) return { ok: false, error: 'Dieser Link ist ungültig.' }
  if (flowLink.expires_at && new Date(flowLink.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: 'Dieser Link ist abgelaufen.' }
  }

  const { data: lead } = await admin
    .from('leads')
    .select('reparatur_werkstatt_id, werkstatt_id')
    .eq('id', flowLink.lead_id as string)
    .maybeSingle()
  const werkstattId =
    ((lead?.reparatur_werkstatt_id as string | null) ?? (lead?.werkstatt_id as string | null)) || null
  if (!werkstattId) return { ok: true, werkstatt: null }

  const { data: w } = await admin
    .from('werkstaetten')
    .select('name, adresse_strasse, adresse_plz, adresse_ort, telefon')
    .eq('id', werkstattId)
    .maybeSingle()

  return { ok: true, werkstatt: (w as ZugewieseneWerkstatt | null) ?? null }
}
