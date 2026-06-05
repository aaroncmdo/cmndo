// CMM Entity Resolver-Foundation: find-or-create der globalen firmen-Entitaet.
// Dedup-Key: ust_id (staerkster Beleg) ODER normalized_name. Non-throwing Result-Object;
// db untyped (wie ensure-person.ts/ensure-vehicle.ts), da die DB-Types der frischen Spalte
// hinterherhinken (AGENTS.md Regel 2 Schritt 6).
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from '@/lib/entities/normalize'

export type FirmaSnapshot = {
  name: string
  ust_id?: string | null
  rechtsform?: string | null
  adresse_strasse?: string | null
  adresse_plz?: string | null
  adresse_ort?: string | null
  adresse_land?: string | null
  telefon?: string | null
  email?: string | null
  webseite?: string | null
  ansprechpartner_person_id?: string | null
  quelle?: string | null
}
export type EnsureFirmaResult =
  | { ok: true; firmaId: string; created: boolean }
  | { ok: false; error: string }

export async function ensureFirma(params: {
  db: SupabaseClient
  snapshot: FirmaSnapshot
}): Promise<EnsureFirmaResult> {
  const { db } = params
  const name = params.snapshot.name?.trim() ?? ''
  if (!name) return { ok: false, error: 'firma name leer' }
  const normalized = normalizeName(name)
  if (!normalized) return { ok: false, error: 'firma normalized leer' }
  const ustId = params.snapshot.ust_id?.trim() || null

  const setAnsprechpartnerIfEmpty = async (firmaId: string) => {
    if (params.snapshot.ansprechpartner_person_id) {
      await db.from('firmen')
        .update({ ansprechpartner_person_id: params.snapshot.ansprechpartner_person_id })
        .eq('id', firmaId).is('ansprechpartner_person_id', null)
    }
  }

  try {
    // 1) ust_id — staerkster Key
    if (ustId) {
      const { data, error } = await db.from('firmen').select('id').eq('ust_id', ustId).limit(1).maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (data?.id) { await setAnsprechpartnerIfEmpty(data.id as string); return { ok: true, firmaId: data.id as string, created: false } }
    }
    // 2) normalized_name
    const { data: byName, error: nErr } = await db.from('firmen').select('id').eq('normalized_name', normalized).limit(1).maybeSingle()
    if (nErr) return { ok: false, error: nErr.message }
    if (byName?.id) { await setAnsprechpartnerIfEmpty(byName.id as string); return { ok: true, firmaId: byName.id as string, created: false } }
    // 3) create
    const { data: created, error: insErr } = await db.from('firmen').insert({
      name, normalized_name: normalized, ust_id: ustId,
      rechtsform: params.snapshot.rechtsform ?? null,
      adresse_strasse: params.snapshot.adresse_strasse ?? null,
      adresse_plz: params.snapshot.adresse_plz ?? null,
      adresse_ort: params.snapshot.adresse_ort ?? null,
      adresse_land: params.snapshot.adresse_land ?? null,
      telefon: params.snapshot.telefon ?? null,
      email: params.snapshot.email ?? null,
      webseite: params.snapshot.webseite ?? null,
      ansprechpartner_person_id: params.snapshot.ansprechpartner_person_id ?? null,
      quelle: params.snapshot.quelle ?? 'lead_konvertierung',
    }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'firmen-insert lieferte keine id' }
    return { ok: true, firmaId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
