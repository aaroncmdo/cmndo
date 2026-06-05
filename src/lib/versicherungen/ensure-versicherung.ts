// CMM Entity Resolver-Foundation: find-or-create Versicherer ueber normalized_name.
// Ersetzt den reinen Fuzzy-Match (resolveFallEntityFks) durch resolve-or-ensure.
// versicherungen.name ist UNIQUE (exakt) -> create nur wenn normalized kein Match fand.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from '@/lib/entities/normalize'

export type EnsureVersicherungResult =
  | { ok: true; versicherungId: string; created: boolean }
  | { ok: false; error: string }

export async function ensureVersicherung(params: {
  db: SupabaseClient
  klartext: string | null | undefined
}): Promise<EnsureVersicherungResult> {
  const { db } = params
  const name = params.klartext?.trim() ?? ''
  if (!name) return { ok: false, error: 'versicherung klartext leer' }
  const normalized = normalizeName(name)
  if (!normalized) return { ok: false, error: 'versicherung normalized leer' }
  try {
    const { data: existing, error: selErr } = await db
      .from('versicherungen').select('id').eq('normalized_name', normalized).limit(1).maybeSingle()
    if (selErr) return { ok: false, error: selErr.message }
    if (existing?.id) return { ok: true, versicherungId: existing.id as string, created: false }

    const { data: created, error: insErr } = await db
      .from('versicherungen').insert({ name, normalized_name: normalized }).select('id').single()
    if (insErr || !created) return { ok: false, error: insErr?.message ?? 'versicherungen-insert lieferte keine id' }
    return { ok: true, versicherungId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
