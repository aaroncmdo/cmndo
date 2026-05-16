// CMM-60 Schritt 3: SSoT-Write der SV-Zuweisung.
//
// claims.sv_id ist seit CMM-60 die kanonische SV-Zuweisung. Dieser Helper
// kapselt den Write: Caller liefern die fall_id (die kennen sie), der Helper
// loest claim_id auf und schreibt claims.sv_id. Der DB-Trigger
// trg_sync_claims_sv_id_to_faelle spiegelt nach faelle.sv_id zurueck.
//
// Analog updateKbOnFallAndClaim aus kb-assignment.ts (CMM-48-Muster).

import type { SupabaseClient } from '@supabase/supabase-js'

// Generische Client-Signatur, damit Server-Action- und Admin-Client passen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

/**
 * Setzt die SV-Zuweisung des Falls auf der SSoT-Tabelle claims.
 * `svId = null` gibt die Zuweisung frei. faelle.sv_id wird per
 * Reverse-Trigger gespiegelt — der Caller muss faelle.sv_id NICHT schreiben.
 */
export async function setSvIdForFall(
  supabase: AnySupabase,
  fallId: string,
  svId: string | null,
): Promise<void> {
  const { data: fall } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  const claimId = (fall?.claim_id as string | null) ?? null
  if (!claimId) {
    console.error('[CMM-60] setSvIdForFall: kein claim_id fuer Fall', fallId)
    return
  }
  const { error } = await supabase.from('claims').update({ sv_id: svId }).eq('id', claimId)
  if (error) {
    console.error('[CMM-60] setSvIdForFall: claims-Update fehlgeschlagen:', error.message)
  }
}
