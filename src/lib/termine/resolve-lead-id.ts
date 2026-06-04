// CMM-49 — faelle-freie lead_id-Aufloesung fuer Termine.
//
// Ersetzt den wiederkehrenden `faelle.select('lead_id').eq('id', termin.fall_id)`-
// Read (Tier-1 faelle-Drop-Blocker: liest die faelle-TABELLE, die beim Drop
// verschwindet). Bevorzugt die eigene gutachter_termine.lead_id-Spalte, faellt
// sonst auf claims.lead_id zurueck (via claim_id, vom CMM-58-Trigger aus fall_id
// gesetzt). Live 10/10 verifiziert value-preserving:
//   COALESCE(termin.lead_id, claims.lead_id) == faelle.lead_id
// (faelle.lead_id und claims.lead_id koennen global divergieren — fuer fall-
// verlinkte Termine stimmt der COALESCE-Pfad aber exakt, da termin.lead_id beim
// Setzen aus dem Lead stammt und claims.lead_id der SSoT-Fallback ist).
//
// Bewusst KEIN 'use server' (reine Util, importierbar).

import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export async function resolveTerminLeadId(
  db: AdminClient,
  termin: { lead_id?: string | null; claim_id?: string | null },
): Promise<string | null> {
  if (termin.lead_id) return termin.lead_id
  if (!termin.claim_id) return null
  const { data: claim } = await db
    .from('claims')
    .select('lead_id')
    .eq('id', termin.claim_id)
    .maybeSingle()
  return (claim?.lead_id as string | null) ?? null
}
