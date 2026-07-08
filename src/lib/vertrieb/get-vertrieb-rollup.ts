// src/lib/vertrieb/get-vertrieb-rollup.ts
// Aggregat kind×stufe — in TS ueber getVertriebKontakte (EINE Ableitungs-Wahrheit, DRY).
// Kein zweites SQL-Ableitungs-System; eine SQL-Rollup-View erst bei Perf-Bedarf (Follow-up).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getVertriebKontakte } from './get-vertrieb-kontakte'
import type { VertriebRollupZelle } from './vertrieb-rollup.types'

export async function getVertriebRollup(
  supabase: SupabaseClient,
): Promise<{ ok: true; data: VertriebRollupZelle[] } | { ok: false; error: string }> {
  const res = await getVertriebKontakte(supabase)
  if (!res.ok) return res
  const map = new Map<string, VertriebRollupZelle>()
  for (const k of res.data) {
    const key = `${k.kind}|${k.stufe}`
    const cur = map.get(key)
    if (cur) cur.anzahl++
    else map.set(key, { kind: k.kind, stufe: k.stufe, anzahl: 1 })
  }
  return { ok: true, data: [...map.values()] }
}
