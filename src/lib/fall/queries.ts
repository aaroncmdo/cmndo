// AAR-651: Zentrale Fall-Loader-Lib — Single Source of Truth pro Rolle.
//
// Hintergrund: Bis hierhin hatte jede Fall-Detail-Route (Admin/KB/Kanzlei,
// SV, Kunde) eigene Supabase-Queries mit leicht abweichenden Selects.
// Beispiel: AAR-626 hat den Admin-Lead-Select gefixt, der SV-Lead-Select
// blieb kaputt (→ PR #100). Jeder neue Schema-Change an 4+ Stellen nachziehen.
//
// Diese Lib kapselt die Queries pro Rolle:
//   - getFallForSv()      → all + explizite sv_id-Filter (Defense-in-Depth)
//   - getFallById()       → Admin-Shell ohne Ownership-Gate (Error-Boundary-freundlich)
//   - getFallForMakler()  → lebt weiter in src/lib/makler/queries.ts
//     (andere Shape wegen Consent-Scope + Minimal-View)
//
// Kanonizitäts-Audit 25.06.: getFallForAdmin / getFallForKunde + FALL_SELECT_KUNDE
// waren 0-Caller-Leichen (Kunde-Portal liest seit CMM-28 via getKundeFallDetailRecord,
// Admin-Fallakte via getFallById) — entfernt.
//
// Die Lib nutzt durchgängig `v_faelle_mit_aktuellem_termin` als View —
// diese joint den „aktuellen gutachter_termin" als Flat-Felder (sv_termin,
// gutachter_termin_status, etc.) an den Fall-Row.

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Select-Konstanten ─────────────────────────────────────────────────────

/**
 * Vollständiger SELECT — Admin/KB/Kanzlei + SV. Alle Spalten + View-Computed.
 * Äquivalent zu `.select('*')`, nur expliziter für Review-Lesbarkeit.
 */
export const FALL_SELECT_FULL = '*'

// ─── Loader pro Rolle ──────────────────────────────────────────────────────

/**
 * SV-Loader. Zusätzlich explizit `sv_id = svId` gefiltert als Defense-in-Depth
 * über RLS hinaus. RLS allein würde auch greifen, aber der explizite Filter
 * macht die Intention klar und verhindert versehentliches Leaken wenn RLS
 * mal lockerer wird.
 */
export async function getFallForSv(
  supabase: SupabaseClient,
  fallId: string,
  svId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(FALL_SELECT_FULL)
    .eq('id', fallId)
    .eq('sv_id', svId)
    .single()
  if (error) {
    console.error('[fall-queries] getFallForSv:', error.message)
    return null
  }
  return data as unknown as Record<string, unknown>
}

/**
 * Admin-Fall ohne Ownership-Gate (für Routes die bereits eine Admin-Rolle
 * verifiziert haben). Gibt null zurück bei Not-Found statt zu loggen. Wird in
 * der zentralen Shell genutzt damit der Error-Boundary saubere Entscheidungen trifft.
 */
export async function getFallById(
  supabase: SupabaseClient,
  fallId: string,
  select: string = FALL_SELECT_FULL,
): Promise<Record<string, unknown> | null> {
  // CMM-49: v_faelle_mit_aktuellem_termin sourct halter_*/gegner_*/ist_fahrzeughalter seit dem
  // View-Repoint (Migration 20260623162946 / #3098) selbst aus den Entities (claim_parties/personen/
  // firmen/vehicles) — der frueher noetige v_claim_full-Merge (#3096) ist damit redundant + entfernt.
  const { data } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(select)
    .eq('id', fallId)
    .maybeSingle()
  if (data) return data as unknown as Record<string, unknown>
  // CMM-63 accept-both: der Route-/Such-Param kann auch die claim_id sein (die Global-Suche
  // liefert claim_id als kanonischen Key; kunde/SV-Routen akzeptieren beides bereits). Fallback
  // per claim_id, damit /faelle/[claim_id] aufloest (fixt zugleich den latenten
  // routeForKontext-Admin-Nav, der claim_id an /faelle/[id] schickt).
  const { data: byClaim } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select(select)
    .eq('claim_id', fallId)
    .maybeSingle()
  return byClaim ? (byClaim as unknown as Record<string, unknown>) : null
}
