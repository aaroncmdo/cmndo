// Kanonischer Helper fuer die verursacher-claim_party eines Claims.
//
// Vor dieser Datei war das "find-or-create der verursacher-Party"-Muster 3x kopiert
// (onboarding/table-handlers/claim-parties-handler.ts + faelle/[id]/_actions/stammdaten.ts
// fuer gegner-Spalten UND gegner_name). Identischer Select (claim_id + rolle='verursacher',
// sortiert reihenfolge->created_at, erste) + identischer Insert-Default (rolle/reihenfolge=2).
// Hier zentralisiert (Kanonizitaets-Audit 25.06.).
//
// Die Defaults spiegeln convert-lead-to-claim.ts (der Bulk-Creator: rolle='verursacher',
// reihenfolge=2). convert bleibt bewusst eigenstaendig (bulk partyInserts mit Person-
// Voraufloesung) — dieser Helper deckt nur die on-demand-Nachzuegler ab.
//
// Typisierung wie ensure-person.ts/ensure-vehicle.ts: db untypisiert, damit `.from(...)`
// auch bei hinterherhinkenden generierten DB-Types kompiliert (AGENTS.md Regel 2 Schritt 6).

import type { SupabaseClient } from '@supabase/supabase-js'

export const VERURSACHER_ROLLE = 'verursacher' as const
/** Kanonische Reihenfolge der verursacher-Party (== convert-lead-to-claim). */
export const VERURSACHER_REIHENFOLGE = 2

export type VerursacherPartyRef = { id: string; person_id: string | null; firma_id: string | null }

/**
 * Findet die kanonische verursacher-Party eines Claims — genau die Zeile, die v_claim_full.gp
 * liest (rolle='verursacher', sortiert nach reihenfolge dann created_at, erste). `party` ist null,
 * wenn keine existiert. Select-Fehler werden als Result surfaced (statt als "keine Party"
 * fehlinterpretiert).
 */
export async function findVerursacherParty(
  db: SupabaseClient,
  claimId: string,
): Promise<{ ok: true; party: VerursacherPartyRef | null } | { ok: false; error: string }> {
  const { data, error } = await db
    .from('claim_parties')
    .select('id, person_id, firma_id')
    .eq('claim_id', claimId)
    .eq('rolle', VERURSACHER_ROLLE)
    .order('reihenfolge', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, party: (data as VerursacherPartyRef | null) ?? null }
}

/**
 * Legt eine verursacher-Party mit den kanonischen Defaults an (rolle + reihenfolge) und mergt
 * `extra` (Gegner-Fakten / person_id / firma_id). `quelle` MUSS claim_parties_quelle_check
 * erfuellen ('kunde_self' | 'manuell_kb' | 'lead_konvertierung' | 'sv_besichtigung' | 'airdrop' | ...).
 */
export async function insertVerursacherParty(
  db: SupabaseClient,
  claimId: string,
  quelle: string,
  extra: Record<string, unknown> = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.from('claim_parties').insert({
    claim_id: claimId,
    rolle: VERURSACHER_ROLLE,
    reihenfolge: VERURSACHER_REIHENFOLGE,
    quelle,
    ...extra,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
