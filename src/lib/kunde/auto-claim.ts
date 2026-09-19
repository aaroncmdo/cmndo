// AAR-kunde-auto-claim: Beim ersten Login/Page-Load eines Kunden alle Fälle auf
// den User claimen, deren Lead-Kontakt mit dem User übereinstimmt, aber deren
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
// Login ohne Link (19.09.2026, Soll-Blatt 2026-09-19-kunde-kommt-ohne-link-ins-konto):
// die Zuordnung kennt jetzt BEIDE Kontaktachsen. Bisher nur leads.email — ein Kunde,
// der nur eine Nummer hinterlassen hat, sah selbst mit Konto einen leeren Vorgang.
// Telefon laeuft ueber den 9-Ziffern-Suffix auf leads.telefon_ziffern
// (lead-kontakt.ts), nie ueber Gleichheit auf leads.telefon.
//
// CMM-49 (faelle-Drop): schreibt nur noch claims.geschaedigter_user_id (+ den
// claim_parties-Ownership-Pfad). Der frühere faelle.kunde_id-Spiegel-Write ist
// entfernt — faelle.kunde_id ist prod-reader-frei.
//
// Diese Funktion wird mit dem Service-Client (admin) ausgeführt — kein RLS-
// Check, einziger Filter ist der Kontakt-Match. Idempotent: wenn alle Fälle
// bereits die Ownership gesetzt haben, macht sie nichts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'

export async function claimFaelleByKontakt(
  admin: SupabaseClient,
  userId: string,
  kontakt: { email: string | null; telefon: string | null },
): Promise<{ claimed: number }> {
  if (!kontakt.email && !kontakt.telefon) return { claimed: 0 }

  const { claimIds } = await findeVorgaengeZuKontakt(admin, { email: kontakt.email, telefon: kontakt.telefon })
  if (claimIds.length === 0) return { claimed: 0 }

  // CMM-49 (faelle-Drop-Runway): Ownership claims-nativ — der frühere faelle.kunde_id-
  // Spiegel-Write ist entfernt. claims.geschaedigter_user_id ist der Ownership-SSoT
  // (CMM-49 Option A). Additiv + idempotent (`is null`), Kontakt-Match-Grant.
  const { data: claimedRows, error: claimErr } = await admin
    .from('claims')
    .update({ geschaedigter_user_id: userId })
    .in('id', claimIds)
    .is('geschaedigter_user_id', null)
    .select('id')
  if (claimErr) {
    console.warn('[claimFaelleByKontakt] claims.geschaedigter_user_id-Update fehlgeschlagen:', claimErr.message)
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
  if (partyErr) console.warn('[claimFaelleByKontakt] claim_parties.user_id-Update:', partyErr.message)

  return { claimed: (claimedRows ?? []).length }
}

/** Bestehender Aufrufer-Vertrag (kunde/page.tsx, kunde/layout.tsx) — E-Mail-only. */
export async function claimFaelleByEmail(
  admin: SupabaseClient,
  userId: string,
  userEmail: string,
): Promise<{ claimed: number }> {
  if (!userEmail) return { claimed: 0 }
  return claimFaelleByKontakt(admin, userId, { email: userEmail, telefon: null })
}
