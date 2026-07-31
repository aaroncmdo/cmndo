// P4 (Netzwerk SV-Vermittlungs-Flow): das Kunden-Bestaetigungs-Gate.
// Signal = sa_unterschrieben (die legale Kunden-Bestaetigung). NICHT onboarding_complete:
// ein Normalfall-Claim erreicht 'gutachten-eingegangen' legitim mit onboarding_complete=false
// (Portal-Wizard aufgeschoben) — ein Gate darauf wuerde die Regulierung stranden. Jeder
// Nicht-SV-Flow-Claim wird sa_unterschrieben=true geboren (Claim entsteht am SA-Signing) ->
// dieses Gate ist dort inert; nur der SV-Sofort-Claim (geboren false) wird geblockt.
// DECISIONS: docs/fundament/DECISIONS.md 2026-07-30 P4.
export function kundeHatBestaetigt(claim: { sa_unterschrieben?: boolean | null }): boolean {
  return claim.sa_unterschrieben === true
}
