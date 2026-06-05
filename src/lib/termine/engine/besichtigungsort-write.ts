import type { SupabaseClient } from '@supabase/supabase-js'

export type BestaetigtVon = 'kunde' | 'sv'

async function resolveDb(opts?: { db?: SupabaseClient }): Promise<SupabaseClient> {
  return opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
}

/** Korrigiert das geocodete Vor-Ort-Ziel + markiert es als bestaetigt (durch den Korrigierenden). */
export async function korrigiereBesichtigungsort(
  terminId: string,
  ort: { adresse: string; lat: number; lng: number },
  von: BestaetigtVon,
  opts?: { db?: SupabaseClient },
): Promise<{ ok: boolean; error?: string }> {
  if (!ort.adresse?.trim()) return { ok: false, error: 'Adresse fehlt' }
  if (ort.lat == null || ort.lng == null) return { ok: false, error: 'Koordinaten fehlen — bitte Vorschlag aus der Liste wählen.' }
  const client = await resolveDb(opts)
  // Cast: die 2 bestaetigt-Spalten sind noch nicht in database.types (Regen deferred).
  const patch: Record<string, unknown> = {
    besichtigungsort_adresse: ort.adresse,
    besichtigungsort_lat: ort.lat,
    besichtigungsort_lng: ort.lng,
    besichtigungsort_bestaetigt_am: new Date().toISOString(),
    besichtigungsort_bestaetigt_von: von,
  }
  const { error } = await client.from('gutachter_termine').update(patch).eq('id', terminId)
  if (error) return { ok: false, error: error.message }
  // Audit (non-critical)
  try {
    const { data: t } = await client.from('gutachter_termine').select('fall_id').eq('id', terminId).maybeSingle()
    const fid = (t as { fall_id?: string | null } | null)?.fall_id ?? null
    if (fid) await client.from('timeline').insert({ fall_id: fid, typ: 'system', titel: `Besichtigungsort korrigiert (${von})`, beschreibung: ort.adresse })
  } catch { /* non-critical */ }
  return { ok: true }
}

/** Bestaetigt das bestehende Ziel ohne Coord-Change ("Ja, stimmt"). Idempotent. */
export async function bestaetigeBesichtigungsort(
  terminId: string,
  von: BestaetigtVon,
  opts?: { db?: SupabaseClient },
): Promise<{ ok: boolean; error?: string }> {
  const client = await resolveDb(opts)
  const patch: Record<string, unknown> = {
    besichtigungsort_bestaetigt_am: new Date().toISOString(),
    besichtigungsort_bestaetigt_von: von,
  }
  const { error } = await client.from('gutachter_termine').update(patch).eq('id', terminId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
