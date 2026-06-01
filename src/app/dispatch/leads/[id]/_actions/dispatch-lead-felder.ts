'use server'

// P2b (dispatch-config-unify): config-getriebener Dispatcher-Save fuer DispatchLeadForm.
// Schreibt geaenderte lead-erfassung-Felder auf den Lead. db_target + erlaubte
// Spalten kommen SERVERSEITIG aus onboarding_felder (Client-Mapping wird NICHT
// vertraut — Allowlist-Aequivalent zu STAMMDATEN_ALLOWED_FIELDS, nur config-getrieben).
//
// Coercion (§D.1): segmented 'true'/'false' -> boolean (bool leads-Spalten);
// number -> Number; '' -> null. zb1-upload wird uebersprungen (der OCR-Endpoint
// schreibt kennzeichen, nicht dieser generische Save). Sentinels _termin/_finalize
// (Termin/SA) sind keine leads-Spalten -> fallen automatisch raus.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type FeldMeta = { spalte: string; typ: string }

async function ladeLeadErfassungLeadsFelder(): Promise<Map<string, FeldMeta>> {
  const admin = createAdminClient()
  const { data: phasen } = await admin
    .from('onboarding_phasen')
    .select('id')
    .eq('flow_key', 'lead-erfassung')
  const phaseIds = ((phasen ?? []) as Array<{ id: string }>).map((p) => p.id)
  const map = new Map<string, FeldMeta>()
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
    const t = row.db_target
    if (row.typ === 'zb1-upload') continue // OCR-Endpoint schreibt kennzeichen, nicht der generische Save
    if (t?.tabelle === 'leads' && t.spalte) map.set(row.feld_key, { spalte: t.spalte, typ: row.typ })
  }
  return map
}

function coerceVal(typ: string, v: unknown): unknown {
  if (v === '' || v === undefined) return null
  if (typ === 'number') return typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v
  if (typ === 'segmented' && (v === 'true' || v === 'false')) return v === 'true'
  return v
}

export async function saveDispatchLeadFelder(
  leadId: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // SA-Conversion-Lockdown (wie saveStammdaten): nach SA-Unterschrift ist der Fall
  // Source-of-Truth — Lead-Edit wuerde Drift erzeugen.
  const { data: lead } = await supabase
    .from('leads')
    .select('sa_unterschrieben')
    .eq('id', leadId)
    .maybeSingle()
  if (lead?.sa_unterschrieben) {
    return { ok: false, error: 'Lead ist konvertiert — bitte über die Fallakte editieren.' }
  }

  const feldMap = await ladeLeadErfassungLeadsFelder()
  const update: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(values)) {
    const meta = feldMap.get(key)
    if (!meta) continue // unbekannt / Sentinel / zb1-upload -> skip
    update[meta.spalte] = coerceVal(meta.typ, raw)
  }

  if (Object.keys(update).length === 0) return { ok: true }

  update.updated_at = new Date().toISOString()
  const { error } = await supabase.from('leads').update(update).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}
