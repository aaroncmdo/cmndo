// CMM-60 Schritt 3: SSoT-Write der SV-Zuweisung.
//
// claims.sv_id ist seit CMM-60 die kanonische SV-Zuweisung. Dieser Helper
// kapselt den Write: Caller liefern die fall_id (die kennen sie), der Helper
// loest claim_id auf und schreibt claims.sv_id. Der DB-Trigger
// trg_sync_claims_sv_id_to_faelle spiegelt nach faelle.sv_id zurueck.
//
// Analog updateKbOnFallAndClaim aus kb-assignment.ts (CMM-48-Muster).

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { pruefeTestSvKonsistenz } from '@/lib/testdaten/test-sv-guard'

// Generische Client-Signatur, damit Server-Action- und Admin-Client passen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

export type SetSvIdResult =
  | { ok: true }
  | { ok: false; grund: string; code: 'kein_claim' | 'test_guard' | 'db' }

/**
 * Setzt die SV-Zuweisung des Falls auf der SSoT-Tabelle claims.
 * `svId = null` gibt die Zuweisung frei. faelle.sv_id wird per
 * Reverse-Trigger gespiegelt — der Caller muss faelle.sv_id NICHT schreiben.
 *
 * Liefert ein Result-Object; Caller, die den Rueckgabewert ignorieren, verhalten sich
 * wie bisher (frueher `Promise<void>`) — wer zuweist, sollte `ok` aber pruefen, sonst
 * bleibt ein Guard-Block unsichtbar.
 */
export async function setSvIdForFall(
  supabase: AnySupabase,
  fallId: string,
  svId: string | null,
): Promise<SetSvIdResult> {
  const claimId = await resolveClaimId(supabase, fallId)
  if (!claimId) {
    console.error('[CMM-60] setSvIdForFall: kein claim_id fuer Fall', fallId)
    return { ok: false, grund: 'Kein Claim zum Fall gefunden', code: 'kein_claim' }
  }
  // Test-SV-Guard auf der ZUWEISUNGS-Achse (11.08.). Bisher sass der Guard NUR im
  // Buchungs-Chokepoint reserviere() — eine reine sv_id-Zuweisung lief ungeprueft durch.
  // Belegt an CLM-2026-01011: ein Smoke-Claim klebte 13 Tage im Portal eines ECHTEN Partner-SV,
  // ohne dass je ein Termin gebucht wurde. Nur bei echter Zuweisung pruefen — `svId = null`
  // (Freigabe) ist immer erlaubt. pruefeTestSvKonsistenz ist fail-open: Lookup-Fehler oder
  // unbekannte Identitaet blockieren NIE, damit keine legitime Zuweisung bricht.
  if (svId) {
    const guard = await pruefeTestSvKonsistenz(supabase as SupabaseClient, svId, { typ: 'fall', id: claimId })
    if (guard.blockieren) {
      console.warn('[test-sv-guard] SV-Zuweisung blockiert:', guard.grund, { fallId, svId })
      return { ok: false, grund: guard.grund ?? 'Test-Guard: Zuweisung blockiert.', code: 'test_guard' }
    }
  }
  const { error } = await supabase.from('claims').update({ sv_id: svId }).eq('id', claimId)
  if (error) {
    console.error('[CMM-60] setSvIdForFall: claims-Update fehlgeschlagen:', error.message)
    return { ok: false, grund: error.message, code: 'db' }
  }
  return { ok: true }
}
