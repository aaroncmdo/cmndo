// P4 (Netzwerk SV-Vermittlungs-Flow): das Kunden-Bestaetigungs-Gate.
// Signal = sa_unterschrieben (die legale Kunden-Bestaetigung). NICHT onboarding_complete:
// ein Normalfall-Claim erreicht 'gutachten-eingegangen' legitim mit onboarding_complete=false
// (Portal-Wizard aufgeschoben) — ein Gate darauf wuerde die Regulierung stranden. Jeder
// Nicht-SV-Flow-Claim wird sa_unterschrieben=true geboren (Claim entsteht am SA-Signing) ->
// dieses Gate ist dort inert; nur der SV-Sofort-Claim (geboren false) wird geblockt.
// DECISIONS: docs/fundament/DECISIONS.md 2026-07-30 P4.
// Ops-Test 12.08. (Aaron-Entscheid): Zweites, gleichwertiges Signal — die
// Sicherungsabtretung liegt dem Sachverstaendigen bereits OFFLINE vor und wurde per
// Checkbox bestaetigt (claims.sa_extern_bestaetigt_am, mit Urheber in _von). Im
// SV-Vermittlungsfall ist eine zweite digitale Unterschrift des Kunden sinnlos; ohne
// dieses Signal blockierte die P4-Invariante die Werkstatt-Vermittlung komplett
// ("kein Auftrag angelegt", Ops-Test #23).
//
// Das Feld ist OPTIONAL: die beiden anderen Consumer (filmcheck, autoPhase) laden es
// nicht und verhalten sich dadurch unveraendert — die Erweiterung wirkt nur dort, wo
// die Spalte auch gelesen wird.
export function kundeHatBestaetigt(claim: {
  sa_unterschrieben?: boolean | null
  sa_extern_bestaetigt_am?: string | null
}): boolean {
  return claim.sa_unterschrieben === true || claim.sa_extern_bestaetigt_am != null
}
