// Reine Modell-Helfer fuer das Claim-Chat-Thread-Modell (Phase 2). Kein DB-I/O -> testbar.
// Konsumiert von thread-actions.ts (get-or-create + persist). Lokale Typen (das geteilte
// database.types.ts wird unter Nebenlaeufigkeit NICHT regeneriert — Cast-Pattern in den Actions).

export type ThreadArt = 'kunde_gruppe' | 'team_intern' | 'direkt'

/** Zuweisungs-Felder eines Claims, aus denen die Gruppen-Teilnehmer abgeleitet werden. */
export interface ClaimZuweisung {
  geschaedigter_user_id: string | null
  kundenbetreuer_id: string | null
  sv_id: string | null
}

export interface ThreadTeilnehmer {
  userId: string
  rolle: string
}

/** Deterministische Sortierung eines Direkt-Paars -> [direkt_user_a, direkt_user_b] (a <= b). */
export function sortiereDirektPaar(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a]
}

/**
 * Leitet die Teilnehmer eines Gruppen-Threads aus den Claim-Zuweisungen ab.
 * - kunde_gruppe: Kunde (geschaedigter_user_id) + Betreuer + Gutachter
 * - team_intern:  nur Betreuer + Gutachter (KEIN Kunde)
 * null-Zuweisungen werden uebersprungen; dieselbe Person mit zwei Rollen erscheint einmal
 * (erste Rolle gewinnt).
 */
export function leiteGruppenTeilnehmer(
  claim: ClaimZuweisung,
  art: 'kunde_gruppe' | 'team_intern',
): ThreadTeilnehmer[] {
  const kandidaten: ThreadTeilnehmer[] = []
  if (art === 'kunde_gruppe' && claim.geschaedigter_user_id) {
    kandidaten.push({ userId: claim.geschaedigter_user_id, rolle: 'kunde' })
  }
  if (claim.kundenbetreuer_id) kandidaten.push({ userId: claim.kundenbetreuer_id, rolle: 'kundenbetreuer' })
  if (claim.sv_id) kandidaten.push({ userId: claim.sv_id, rolle: 'sachverstaendiger' })

  const gesehen = new Set<string>()
  return kandidaten.filter((p) => {
    if (gesehen.has(p.userId)) return false
    gesehen.add(p.userId)
    return true
  })
}
