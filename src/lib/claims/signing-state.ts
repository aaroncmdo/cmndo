// FG6 (interaction-flags §5.11): collapse the dual-SSoT SA/Vollmacht signing facts.
//
// The signing events are stored on BOTH claims and leads. Canonical source
// (verified 2026-07-11): the CLAIM copy is authoritative POST-conversion (a claim
// row only exists after conversion; every claim/portal/SV reader + both reminder
// crons read the claim side); the LEAD copy is authoritative PRE-conversion (before
// a claim exists — dispatch lead views + funnel analytics). This helper derives the
// signing booleans from the right copy, K3-style (bool = timestamp IS NOT NULL),
// generalising the vollmacht_signiert_am exemplar (flow/[token]/actions.ts).
//
// NOT a 'use server' file: this non-function export must stay importable by client +
// server without becoming undefined in the client bundle (AGENTS.md §use-server).

export type SigningCopy = {
  sa_unterschrieben?: boolean | null
  sa_unterschrieben_am?: string | null
  vollmacht_signiert_am?: string | null
}

export type SigningStateInput = {
  /** true when the claim row is known to exist (post-conversion). Optional: a
   *  non-null `claim` with any signing field set is also treated as authoritative. */
  hasClaim?: boolean
  claim?: SigningCopy | null
  lead?: SigningCopy | null
}

export type ClaimSigningState = {
  saUnterschrieben: boolean
  saUnterschriebenAm: string | null
  vollmachtSigniertAm: string | null
}

function copyHasAnySigning(c: SigningCopy | null | undefined): boolean {
  if (!c) return false
  return c.sa_unterschrieben === true || c.sa_unterschrieben_am != null || c.vollmacht_signiert_am != null
}

/** Pick the authoritative copy (claim post-conversion, lead pre-conversion) and
 *  derive the signing state. Bool is derived from the timestamp (K3). */
export function readClaimSigningState(input: SigningStateInput): ClaimSigningState {
  const claimAuthoritative = input.hasClaim === true || copyHasAnySigning(input.claim)
  const src: SigningCopy = (claimAuthoritative ? input.claim : input.lead) ?? {}
  const saUnterschriebenAm = src.sa_unterschrieben_am ?? null
  const vollmachtSigniertAm = src.vollmacht_signiert_am ?? null
  return {
    saUnterschriebenAm,
    vollmachtSigniertAm,
    saUnterschrieben: saUnterschriebenAm != null || src.sa_unterschrieben === true,
  }
}
