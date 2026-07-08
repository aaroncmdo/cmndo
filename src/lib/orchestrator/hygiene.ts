// src/lib/orchestrator/hygiene.ts
// Reine Kandidaten-Hygiene-Praedikate fuer den Orchestrator-Cron.
// Ziel: Test-/Seed-Faelle + aktiv bearbeitete Faelle NICHT reviewen (spart
// Anthropic-Calls, haelt die Annahmequote-Metrik sauber). Siehe Spec §2.

export type HygieneClaim = {
  id: string
  sv_id: string | null
  geschaedigter_user_id: string | null
  created_by_user_id: string | null
}

// Hand-erzeugte Seed-Fixtures tragen das Muster xxxx-0000-4000-8000-... ;
// echte v4-UUIDs haben dort Zufallswerte -> ~0 False-Positives.
export function istSeedFixture(claimId: string): boolean {
  return claimId.includes('-0000-4000-8000-')
}

export function istTestOderSeedFall(
  claim: HygieneClaim,
  sets: { testSvIds: Set<string>; testUserIds: Set<string> },
): boolean {
  if (istSeedFixture(claim.id)) return true
  if (claim.sv_id && sets.testSvIds.has(claim.sv_id)) return true
  if (claim.geschaedigter_user_id && sets.testUserIds.has(claim.geschaedigter_user_id)) return true
  if (claim.created_by_user_id && sets.testUserIds.has(claim.created_by_user_id)) return true
  return false
}

// Ein Fall mit >=1 offenem Task hat laufende Arbeit -> nicht stagnant im
// relevanten Sinn -> ueberspringen.
export function hatAktiveOffeneTasks(offeneTaskAnzahl: number): boolean {
  return offeneTaskAnzahl >= 1
}
