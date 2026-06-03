// Identitaets-Engine §12 Login-Tor — Slice B (Self-Confirm Relink).
//
// Haengt die claim_parties einer Orphan-Person (Shell-Person OHNE eigenen Account)
// auf die Account-Person des eingeloggten Users um — nachdem der User per Self-Confirm
// bestaetigt hat "ja, das war ich". Beschluss Aaron 2026-06-03 "Kompromiss":
//   1) Re-Point: claim_parties.person_id der Orphan-Parteien -> Account-Person
//      (Reads bleiben unveraendert, weil sie weiter claim_parties.person_id lesen),
//      jede umgehaengte Partei haelt ihre vorherige person_id (previous_person_id).
//   2) Tombstone: personen.canonical_person_id der Orphan-Person -> Account-Person
//      (= "superseded by"; match_person_candidates filtert sie ab dann aus).
//
// WICHTIG — Verantwortungs-Trennung:
//   - Diese Lib macht NUR die Mechanik + Integritaets-Guards (kein eigener Account,
//     Account existiert, nicht sich selbst, idempotent).
//   - Die AUTHZ (ist orphanPersonId wirklich ein Kandidat genau DIESES Users?) liegt
//     im Caller / der Server-Action via findOrphanPersonMatchesForUser — NIE hier eine
//     beliebige personId akzeptieren (Claim-Hijack-Schutz).
//
// Laeuft mit einem SERVICE-Client: der User hat selbst keinen RLS-Schreibzugriff auf die
// (noch) fremden Orphan-Parteien; der privilegierte Re-Point passiert service-seitig mit
// der bereits verifizierten userId (§2-Invariante: Zugriff bleibt an user_id/Party-
// Membership, person_id ist reine Dedup-Ebene — nie ein Access-Check).
//
// db untypisiert (wie ensure-person.ts), da personen.canonical_person_id /
// claim_parties.previous_person_id den generierten DB-Types voraus sein koennen
// (AGENTS Regel 2 Schritt 6). Non-throwing Result-Object.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ConfirmOrphanResult =
  | { ok: true; accountPersonId: string; repointedParties: number; alreadyConfirmed: boolean }
  | { ok: false; error: string }

/**
 * Bestaetigt, dass die Orphan-Person `orphanPersonId` = der eingeloggte User ist, und
 * haengt ihre Parteien an die Account-Person um. Idempotent. Wirft nie.
 *
 * Guards (jeder => ok:false, keine Writes):
 *  - Orphan nicht gefunden.
 *  - Keine Account-Person (personen.user_id = userId).
 *  - Orphan == Account-Person.
 *  - Orphan hat eigenen `user_id` => zwei echte Accounts => Hard-Merge (Spec §6), nicht hier.
 *  - Orphan bereits einer ANDEREN Person zugeordnet (canonical_person_id gesetzt).
 * Bereits DEMSELBEN Account zugeordnet => idempotent ok (alreadyConfirmed), keine Writes.
 */
export async function confirmOrphanPersonIsMe(params: {
  db: SupabaseClient
  userId: string
  orphanPersonId: string
}): Promise<ConfirmOrphanResult> {
  const { db, userId, orphanPersonId } = params
  try {
    // 1) Orphan laden
    const { data: orphan, error: oErr } = await db
      .from('personen')
      .select('id, user_id, canonical_person_id')
      .eq('id', orphanPersonId)
      .maybeSingle()
    if (oErr) return { ok: false, error: oErr.message }
    if (!orphan) return { ok: false, error: `Person ${orphanPersonId} nicht gefunden` }

    // 2) Account-Person des Users laden
    const { data: acct, error: aErr } = await db
      .from('personen')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    if (aErr) return { ok: false, error: aErr.message }
    if (!acct?.id) return { ok: false, error: 'Keine Account-Person fuer diesen User gefunden' }
    const accountPersonId = acct.id as string

    // Guard: nicht sich selbst re-pointen
    if (orphanPersonId === accountPersonId) {
      return { ok: false, error: 'Orphan-Person ist die Account-Person selbst' }
    }

    // Guard: eigener Account => Hard-Merge (zwei echte Logins), nicht Slice B
    if (orphan.user_id) {
      return { ok: false, error: 'Person gehoert einem eigenen Account (Hard-Merge noetig, nicht Slice B)' }
    }

    // Idempotenz / Konflikt: bereits abgeloest?
    const existingCanonical = (orphan.canonical_person_id as string | null) ?? null
    if (existingCanonical) {
      if (existingCanonical === accountPersonId) {
        return { ok: true, accountPersonId, repointedParties: 0, alreadyConfirmed: true }
      }
      return { ok: false, error: 'Person wurde bereits einer anderen Person zugeordnet' }
    }

    // 3) Re-Point der Parteien (+ Per-Partei-Provenance)
    const { data: repointed, error: rErr } = await db
      .from('claim_parties')
      .update({ person_id: accountPersonId, previous_person_id: orphanPersonId })
      .eq('person_id', orphanPersonId)
      .select('id')
    if (rErr) return { ok: false, error: rErr.message }

    // 4) Tombstone setzen (Orphan -> Account). Bei Teil-Fehler hier ist ein Re-Run safe:
    //    der Re-Point oben matcht dann 0 Parteien, der Tombstone wird nachgeholt.
    const { error: cErr } = await db
      .from('personen')
      .update({ canonical_person_id: accountPersonId })
      .eq('id', orphanPersonId)
      .select('id')
    if (cErr) return { ok: false, error: cErr.message }

    return {
      ok: true,
      accountPersonId,
      repointedParties: ((repointed as unknown[] | null) ?? []).length,
      alreadyConfirmed: false,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
