// Geteilter serverseitiger Allowlist-Loader + Coercion fuer den lead-erfassung-Flow.
// Spalten/Typen kommen aus onboarding_felder (NIE Client-Mapping vertrauen).
// Consumer: saveDispatchLeadFelder (Dispatcher) + speichereFeststellungFlow (Self-Service).

import { createAdminClient } from '@/lib/supabase/admin'

export type LeadErfassungFeldMeta = { spalte: string; typ: string }

/** feld_key -> {leads-Spalte, typ} fuer alle lead-erfassung-Felder mit db_target.tabelle='leads'.
 *  zb1-upload wird ausgelassen (der OCR-Endpoint schreibt kennzeichen, nicht der generische Save). */
export async function ladeLeadErfassungLeadsFelder(): Promise<Map<string, LeadErfassungFeldMeta>> {
  const admin = createAdminClient()
  const { data: phasen } = await admin
    .from('onboarding_phasen')
    .select('id')
    .eq('flow_key', 'lead-erfassung')
  const phaseIds = ((phasen ?? []) as Array<{ id: string }>).map((p) => p.id)
  const map = new Map<string, LeadErfassungFeldMeta>()
  if (phaseIds.length === 0) return map

  const { data } = await admin
    .from('onboarding_felder')
    .select('feld_key, typ, db_target')
    .in('phase_id', phaseIds)
  for (const row of (data ?? []) as Array<{
    feld_key: string
    typ: string
    db_target: { tabelle?: string; spalte?: string } | null
  }>) {
    if (row.typ === 'zb1-upload') continue
    const t = row.db_target
    if (t?.tabelle === 'leads' && t.spalte) map.set(row.feld_key, { spalte: t.spalte, typ: row.typ })
  }
  return map
}

/** '' / undefined -> null; number -> Number; segmented 'true'/'false' -> boolean; sonst unveraendert. */
export function coerceLeadErfassungWert(typ: string, v: unknown): unknown {
  if (v === '' || v === undefined) return null
  if (typ === 'number') return typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v
  if (typ === 'segmented' && (v === 'true' || v === 'false')) return v === 'true'
  return v
}
