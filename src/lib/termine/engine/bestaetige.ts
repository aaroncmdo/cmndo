import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBesichtigungsort, type OrtQuelle } from './besichtigungsort'
import { geocodeMitFallback, type Geocoder } from './geocode'

export type BestaetigeResult =
  | { ok: true; terminId: string; besichtigungsortLat: number | null; besichtigungsortLng: number | null; quelle: OrtQuelle | 'remote' }
  | { ok: false; error: string; code: 'kein_ziel' | 'not_found' | 'db' }

/**
 * Bestaetigt einen Termin MIT Geocoding-Garantie: das Vor-Ort-Ziel wird aufgeloest +
 * geocodet + auf gutachter_termine.besichtigungsort_lat/lng gecacht. OHNE geocodebares
 * Ziel KEIN 'bestaetigt' (code:'kein_ziel'). Remote (kanal video/telefon) ausgenommen.
 * CMM-73: legt best-effort den erstgutachten-Auftrag an. Notifications (WA/Email/SLA)
 * laufen bis Phase-3-Repoint weiter ueber bestaetigung.ts:bestaetigeTermin (kein Doppel-Send).
 */
export async function bestaetige(
  terminId: string, opts?: { db?: SupabaseClient; geocode?: Geocoder },
): Promise<BestaetigeResult> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const geocode = opts?.geocode ?? geocodeMitFallback

  const { data: t, error } = await db.from('gutachter_termine')
    .select('id, kanal, sv_id, fall_id, claim_id, lead_id, besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_adresse, start_zeit')
    .eq('id', terminId).maybeSingle()
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!t) return { ok: false, error: 'Termin nicht gefunden', code: 'not_found' }

  const remote = t.kanal === 'video' || t.kanal === 'telefon'
  let ort = null as Awaited<ReturnType<typeof resolveBesichtigungsort>> | null
  if (!remote) {
    ort = await resolveBesichtigungsort(t, db, geocode)
    if (!ort) return { ok: false, error: 'Kein geocodebares Besichtigungsort-Ziel — Termin nicht bestätigt', code: 'kein_ziel' }
  }

  const finalVerbindlichAb = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const patch: Record<string, unknown> = { status: 'bestaetigt', final_verbindlich_ab: finalVerbindlichAb }
  if (ort) {
    patch.besichtigungsort_lat = ort.lat
    patch.besichtigungsort_lng = ort.lng
    if (ort.adresse) patch.besichtigungsort_adresse = ort.adresse
    if (ort.placeId) patch.besichtigungsort_place_id = ort.placeId
  }
  const { error: upErr } = await db.from('gutachter_termine').update(patch).eq('id', terminId)
  if (upErr) return { ok: false, error: upErr.message, code: 'db' }

  // CMM-73 (best-effort, non-critical): erstgutachten-Auftrag → v_claim_phase derivt korrekt.
  if (t.fall_id && t.sv_id) {
    try {
      const { createErstgutachtenAuftragWennNoetig } = await import('@/lib/auftrag/create')
      await createErstgutachtenAuftragWennNoetig(db, t.fall_id as string, t.sv_id as string, [terminId])
    } catch (e) { console.error('[bestaetige] erstgutachten:', e instanceof Error ? e.message : e) }
  }
  // Timeline (non-critical).
  if (t.fall_id) {
    try {
      await db.from('timeline').insert({ fall_id: t.fall_id, typ: 'termin', titel: 'Termin bestätigt',
        beschreibung: `Termin bestätigt; verbindlich ab ${new Date(finalVerbindlichAb).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.` })
    } catch { /* non-critical */ }
  }

  return { ok: true, terminId, besichtigungsortLat: ort?.lat ?? null, besichtigungsortLng: ort?.lng ?? null, quelle: ort?.quelle ?? 'remote' }
}
