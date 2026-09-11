import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCheckRef } from './check-ref'

// Nachtraegliche Verknuepfung (2026-09-09): nach der Lead-Anlage in submitCheckLead haengen alle
// Foto-Check-Sessions mit derselben Browser-Kennung, die noch KEINEN Lead haben, an den neuen Lead.
// `lead_id IS NULL` schuetzt Sessions, die schon per ?lead= (Erfolgs-CTA) oder einen frueheren Kontakt
// verknuepft sind. `.select('id')` macht "0 Zeilen" von "Fehler" unterscheidbar (Stille-Write-Lehre).

export type VerknuepfungsErgebnis = { ok: true; anzahl: number } | { ok: false; error: string }

export async function verknuepfeSessionsMitLead(
  sb: SupabaseClient,
  ref: string | null | undefined,
  leadId: string,
): Promise<VerknuepfungsErgebnis> {
  const gueltig = parseCheckRef(ref)
  if (!gueltig) return { ok: true, anzahl: 0 }
  const { data, error } = await sb
    .from('anspruch_schaetzungen')
    .update({ lead_id: leadId })
    .eq('check_ref', gueltig)
    .is('lead_id', null)
    .select('id')
  if (error) return { ok: false, error: error.message }
  return { ok: true, anzahl: data?.length ?? 0 }
}
