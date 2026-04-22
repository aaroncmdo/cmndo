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

  // Alle Fälle dieser Leads die noch keinen Kunden haben → claimen
  const { data: updated, error } = await admin
    .from('faelle')
    .update({ kunde_id: userId })
    .in('lead_id', leadIds)
    .is('kunde_id', null)
    .select('id')

  if (error) {
    console.warn('[claimFaelleByEmail] Update fehlgeschlagen:', error.message)
    return { claimed: 0 }
  }

  return { claimed: (updated ?? []).length }
}
