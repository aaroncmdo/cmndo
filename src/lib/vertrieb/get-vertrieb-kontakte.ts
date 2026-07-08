// src/lib/vertrieb/get-vertrieb-kontakte.ts
// Liest v_vertrieb_kontakt + leitet die Stufe ab. Die View ist service_role-only
// (revoke anon/authenticated) -> der Caller MUSS den Admin-Client NACH einem Staff-
// Role-Guard injizieren (P1-Wiring; adminClient ohne Guard = IDOR). Reines Read+Derive,
// Ergebnis-Objekt statt throw. Vorbild: src/lib/ops/get-claim-workitems.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveVertriebState } from './derive-vertrieb-state'
import type { VertriebKontakt, VertriebKontaktRow } from './vertrieb-kontakt.types'

export async function getVertriebKontakte(
  supabase: SupabaseClient,
): Promise<{ ok: true; data: VertriebKontakt[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('v_vertrieb_kontakt')
    .select('*')
    .order('erstellt_am', { ascending: false, nullsFirst: false })
  if (error) return { ok: false, error: (error as { message: string }).message }
  const rows = (data as VertriebKontaktRow[]) ?? []
  return { ok: true, data: rows.map(deriveVertriebState) }
}
