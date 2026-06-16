// AAR-kunde-auto-claim: Beim ersten Login/Page-Load eines Kunden alle Fälle auf
// den User claimen, deren Lead-Email mit user.email übereinstimmt aber deren
// Ownership (claims.geschaedigter_user_id) noch NULL ist.
//
// Hintergrund:
//   - signSAandCreateFall (flow/[token]/actions.ts) erzeugt den Fall ohne
//     Ownership — der Account existiert zu dem Zeitpunkt noch nicht.
//   - finalizeKundeSetup setzt die Ownership beim Passwort-Setup, läuft aber
//     NICHT wenn der User nur per Magic-Link reinkommt oder das Setup
//     übersprungen wird.
//   - Kunde-Portal + RLS hängen an claims.geschaedigter_user_id (CMM-49 Option A,
//     SSoT). Ohne sie sieht der Kunde nichts (weder /kunde noch /kunde/termine),
//     und auch keine Detail-Seite über RLS.
//
// CMM-49 (faelle-Drop): schreibt nur noch claims.geschaedigter_user_id (+ den
// claim_parties-Ownership-Pfad). Der frühere faelle.kunde_id-Spiegel-Write ist
// entfernt — faelle.kunde_id ist prod-reader-frei.
//
// Diese Funktion wird mit dem Service-Client (admin) ausgeführt — kein RLS-
// Check, einziger Filter ist Email-Match. Idempotent: wenn alle Fälle bereits
// die Ownership gesetzt haben, macht sie nichts.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function claimFaelleByEmail(
  admin: SupabaseClient,
  userId: string,
  userEmail: string,
): Promise<{ claimed: number }> {
  if (!userEmail) return { claimed: 0 }

  // Leads mit dieser Email finden
  const { data: leads } = await admin
    .from('leads')
    .select('id')
    .eq('email', userEmail)

  const leadIds = (leads ?? []).map((l) => l.id as string)
  if (leadIds.length === 0) return { claimed: 0 }

  // CMM-49 (faelle-Drop-Runway): Ownership claims-nativ — der frühere faelle.kunde_id-
  // Spiegel-Write ist entfernt. faelle.kunde_id ist prod-reader-frei (copilot #2915 war der
  // letzte echte Reader; makler/queries liest v_faelle_mit_aktuellem_termin.kunde_id =
  // claims.geschaedigter_user_id, NICHT die faelle-Tabelle). claims.geschaedigter_user_id ist
  // der Ownership-SSoT (CMM-49 Option A). Additiv + idempotent (`is null`), Email-Match-Grant.
  const { data: claimRows } = await admin
    .from('claims')
    .select('id')
    .in('lead_id', leadIds)
  const claimIds = (claimRows ?? []).map((c) => c.id as string)
  if (claimIds.length === 0) return { claimed: 0 }

  const { data: claimedRows, error: claimErr } = await admin
    .from('claims')
    .update({ geschaedigter_user_id: userId })
    .in('id', claimIds)
    .is('geschaedigter_user_id', null)
    .select('id')
  if (claimErr) {
    console.warn('[claimFaelleByEmail] claims.geschaedigter_user_id-Update fehlgeschlagen:', claimErr.message)
    return { claimed: 0 }
  }

  // claim_parties(geschaedigter).user_id — den OR-Ownership-Pfad + Identitäts-Link mitziehen
  // (best-effort: ein Fehler bricht den Login-Flow nicht; nächster Page-Load wiederholt idempotent).
  const { error: partyErr } = await admin
    .from('claim_parties')
    .update({ user_id: userId })
    .in('claim_id', claimIds)
    .eq('rolle', 'geschaedigter')
    .is('user_id', null)
  if (partyErr) console.warn('[claimFaelleByEmail] claim_parties.user_id-Update:', partyErr.message)

  return { claimed: (claimedRows ?? []).length }
}
