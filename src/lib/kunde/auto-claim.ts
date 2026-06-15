// AAR-kunde-auto-claim: Beim ersten Login/Page-Load eines Kunden alle Fälle
// auf den User claimen, deren Lead-Email mit user.email übereinstimmt aber
// kunde_id noch NULL ist.
//
// Hintergrund:
//   - signSAandCreateFall (flow/[token]/actions.ts) erzeugt den Fall mit
//     kunde_id=NULL — der Account existiert zu dem Zeitpunkt noch nicht.
//   - finalizeKundeSetup setzt kunde_id beim Passwort-Setup, läuft aber NICHT
//     wenn der User nur per Magic-Link reinkommt oder das Setup übersprungen
//     wird.
//   - faelle-RLS für „kunde" ist strikt kunde_id=auth.uid() — kein Email-
//     Fallback. Ohne kunde_id sieht der Kunde nichts (weder /kunde noch
//     /kunde/termine), und auch keine Detail-Seite über RLS.
//
// Diese Funktion wird mit dem Service-Client (admin) ausgeführt — kein RLS-
// Check, einziger Filter ist Email-Match. Idempotent: wenn alle Fälle bereits
// kunde_id haben, macht sie nichts.

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

  // 1. faelle.kunde_id — faelle-RLS für „kunde" ist kunde_id=auth.uid() (bis faelle-DROP).
  const { data: updated, error } = await admin
    .from('faelle')
    .update({ kunde_id: userId })
    .in('lead_id', leadIds)
    .is('kunde_id', null)
    .select('id')

  if (error) {
    console.warn('[claimFaelleByEmail] faelle-Update fehlgeschlagen:', error.message)
    return { claimed: 0 }
  }

  // 2. claims-seitige Ownership mitsetzen (CMM-49 Option A, Aaron 15.06.):
  // Nach dem faelle-DROP ist claims.geschaedigter_user_id der Ownership-SSoT (Kunde-Portal
  // + RLS). Würde auto-claim das NICHT mitsetzen, hinge die Sichtbarkeit eines spät
  // registrierten Kunden allein am Email-Fallback (assertKundeOwnsFall/-Claim 2c). Additiv +
  // idempotent (`is null`), gleicher Email-Match-Grant wie der faelle-Write oben. Best-effort:
  // ein Fehler hier bricht den Login-Flow nicht (nächster Page-Load wiederholt es idempotent).
  const { data: claimRows } = await admin
    .from('claims')
    .select('id')
    .in('lead_id', leadIds)
  const claimIds = (claimRows ?? []).map((c) => c.id as string)
  if (claimIds.length > 0) {
    const { error: claimErr } = await admin
      .from('claims')
      .update({ geschaedigter_user_id: userId })
      .in('id', claimIds)
      .is('geschaedigter_user_id', null)
    if (claimErr) console.warn('[claimFaelleByEmail] claims.geschaedigter_user_id-Update:', claimErr.message)

    // claim_parties(geschaedigter).user_id — den OR-Ownership-Pfad + Identitäts-Link mitziehen.
    const { error: partyErr } = await admin
      .from('claim_parties')
      .update({ user_id: userId })
      .in('claim_id', claimIds)
      .eq('rolle', 'geschaedigter')
      .is('user_id', null)
    if (partyErr) console.warn('[claimFaelleByEmail] claim_parties.user_id-Update:', partyErr.message)
  }

  return { claimed: (updated ?? []).length }
}
